'use strict';

import { fetchBuilder, MemoryCache } from 'node-fetch-cache';
import moment from 'moment';

const fetch = fetchBuilder.withCache(new MemoryCache({ ttl: 3600000 }));

/**
 * The function to fetch remote json data
 * 
 * @param {string} url - The destination url
 * @returns {Object} - The object loaded from json
 */

const fetchJson = async url => {
    const response = await fetch(url);
    return response.json();
};

/**
 * The function to map course
 * 
 * @param {Array.<Object>} array 
 * @param {number} index 
 * @returns {object}
 */

const mapCourse = (array, index) => {
    if (array.length > 1) {
        return array[index]
    } else {
        return array[0]
    }
};

/**
 * Convert the schedules in extras to standard schedule
 * 
 * @param {Array.<Object>} schedule - Schedule in extras
 * @param {Object} mappings - Mapping for extras
 * @param {number} index - Class ID
 * @returns 
 */

const convertExtras = (schedule, mappings, index) => {
    return schedule.map(day => {
        return { ...day, courses: day.courses.map(i => mapCourse(mappings[i], index)) }
    })
};

const convertMain = (extras, main) => {
    let schedule = [];
    extras.forEach(day => {
        schedule.push(main.filter(i => i['day'] === day['day'])[0]);
    });
    return schedule
}

/**
 * Parse course data
 * 
 * @returns {Object} Course with data
 */

const parseCourse = (input, mappings, optionalCourseMappings, options, teachers) => {
    const fetchTeacherData = (teacher) => {
        return teachers.filter(t => t.name === teacher)[0]
    };

    let classCourse;

    try {
        classCourse = mapCourse(mappings[input], parseInt(options['sub-class']) - 1);
    } catch {
        return { subject: input, type: 'virtual' }
    }

    if (classCourse.type === 'optionalCourse') {
        classCourse = mapCourse(optionalCourseMappings[classCourse.name], parseInt(options[classCourse.name]) - 1)
    }

    const teacherData = fetchTeacherData(classCourse.teacher);

    const teacherDisplayName = teacherData.displayName ? teacherData.displayName : teacherData.name + "老师";

    const voov = teacherData.voov[classCourse.voovId || 0];

    const course = { ...teacherData, name: null, ...classCourse, id: null, voov: null, voovRoomId: null, voovId: voov.voovId, voovPassword: voov.voovPassword, teacher: teacherDisplayName };

    return course;
};

const generateJSON = async (options, dataSource) => {

    const data = await fetchJson([dataSource, options.school, options.grade, 'data.json'].join('/'));

    const teachers = data.teachers;
    const classData = data.classes[options.class];
    const extras = data.extras;
    const optionalCourseMappings = data.mappings;
    const categoriesData = data.categories;
    const classDisplayName = data.info.grade + classData.info.name;

    let events = [];

    const addEvent = (startTime, duration, course, online) => {
        let event = {};
        const findCategory = (subject) => {
            let categories = [];
            categoriesData.forEach(category => {
                if (category.subjects.includes(subject)) {
                    categories.push(category.name);
                }
            }
            )
            return categories
        };

        if (course.type === 'virtual') {
            course.voovId = classData.info.voovId;
            course.voovPassword = classData.info.voovPassword;
            course.teacher = classDisplayName + '虚拟教师'
        }

        if (course.voovId && online) {
            event.url = 'wemeet://page/inmeeting?meeting_code=' + course.voovId.replace(/\s/g, '');
            event.location = '腾讯会议: ';
            event.location += course.voovPassword ? course.voovId + '(' + course.voovPassword + ')' : course.voovId;
        } else {
            event.location = course.location ? course.location : classDisplayName + '教室';
        }

        let alarms = [];

        if (options.alert !== 'false') {
            let alertMinuteBefore = 10;
            if (options.alert) {
                alertMinuteBefore = parseInt(options.alert);
            }

            alarms[0] = { 
                action: 'display', 
                description: '还有'+alertMinuteBefore.toString()+'分钟就要上'+course.subject+'课啦！', 
                trigger: { 
                    hours: 0, 
                    minutes: alertMinuteBefore, 
                    before: true 
                } 
            };

        }

        event.description = course.name ? course.name + '(' + course.teacher + ')' : classDisplayName + course.subject + '(' + course.teacher + ')';

        events.push({
            ...event,
            start: startTime,
            alarms: alarms,
            duration: duration,
            title: course.subject,
            categories: findCategory(course.subject),
            status: 'CONFIRMED',
            busyStatus: 'BUSY',
        })
    };

    const iterateSchedule = (timeTable, schedule, mappings, fromDate, online) => {
        const date = moment(fromDate, "MM-DD-YYYY");

        const duration = timeTable.duration || { hours: 0, minutes: 40 };
        const breakDuration = timeTable.breakDuration || { hours: 0, minutes: 10 };
        const unmergeableBreaks = timeTable.unmergeableBreaks || [];
        const addDuration = (...duration) => {
            const sum = (ints) => {
                let sum = 0;
                ints.forEach(i => sum = sum + i);
                return sum
            }

            const addedHours = sum(duration.map(i => i.hours));
            const addedMinutes = sum(duration.map(i => i.minutes));

            let addedDuration;

            if (addedMinutes > 60) {
                addedDuration = { hours: addedHours + Math.floor(addedMinutes / 60), minutes: addedMinutes % 60 };
            } else {
                addedDuration = { hours: addedHours, minutes: addedMinutes };
            }

            return addedDuration
        };

        schedule.forEach(day => {
            let classCount = 0;

            day.courses.forEach((c, i) => {
                if (classCount !== i) {
                    return
                }
                classCount = classCount + 1;
                let eventTime = date.toArray().slice(0, 3)
                eventTime.push(...timeTable.days[day['day']][classCount - 1])
                eventTime[1] = eventTime[1] + 1;
                const course = parseCourse(c, mappings, optionalCourseMappings, options, teachers);
                let addedDuration = duration;
                if (!unmergeableBreaks.includes(classCount) && !(!options['skip-break'] === "false" || !options['skip-break'])) {
                    while (day.courses[classCount] === day.courses[classCount - 1] && !unmergeableBreaks.includes(classCount)) {
                        classCount = classCount + 1;
                        addedDuration = addDuration(addedDuration, duration);
                        if (!course.skipBreak) {
                            addedDuration = addDuration(breakDuration, addedDuration);
                        }
                    }
                }

                addEvent(eventTime, addedDuration, course, online);

            })
            date.add(1, 'd');
        })
    }

    extras.forEach(i => {
        const fromDate = moment(i.fromDate, "MM-DD-YYYY");
        const scheduleExtras = convertExtras(i.schedule, i.mappings, parseInt(options.class) - 1);
        const scheduleMain = convertMain(i.schedule, classData.schedule);
        let repeat = 1;
        if (i.repeat.enabled === false) {
            i.repeat.times = 1;
        }
        while (repeat <= i.repeat.times) {
            iterateSchedule(i.timeTable, scheduleExtras, classData.mappings, fromDate.format("MM-DD-YYYY"), i.onlineClass);
            iterateSchedule(data.timeTable, scheduleMain, classData.mappings, fromDate.format("MM-DD-YYYY"), i.onlineClass);
            fromDate.add(i.repeat.schedulePeriod, 'd');
            repeat = repeat + 1;
        }
    }
    )

}