'use strict';

import moment from 'moment';
import 'moment-timezone';

import ics from 'ics';

const configVersions = [6];

/**
 * convert to/from date array or moment object
 * 
 * @param input either a moment object or a 5-element array
 * @returns moment object or date array
 */
const convertTime = input => {
    if (input.length === 5) {
        const time = JSON.parse(JSON.stringify(input));
        time[1] = time[1] - 1;
        return moment(time);
    } else {
        const time = input.toArray();
        time[1] = time[1] + 1;
        return time.slice(0, 5);
    }
};

/**
 * 
 * @param {Array} time time in event.startTime format
 * @param {string} tz 'Asia/Singapore' style timezone
 * @returns time in utc in event.startTime format
 */
const timeToUtc = (input, tz) => {
    const time = JSON.parse(JSON.stringify(input));
    time[1] = time[1] - 1;
    const utcTime = moment.tz(time, tz).tz('utc').toArray();
    utcTime[1] = utcTime[1] + 1;
    return utcTime.slice(0, 5);
};

/**
 * map course from mapping
 * 
 * @param {Array.<Object>} array mapping information
 * @param {number} key mapping key
 * @returns {object} mapped item
 */
const mapCourse = (mapping, key) => {
    if (mapping.length > 1) {
        return mapping[key];
    } else {
        return mapping[0];
    }
};

/**
 * map extra schedule to standard schedule
 * 
 * @param schedule extra schedule
 * @param mappings extra mappings
 * @param {number} key key used for mapping
 * @returns schedule in standard format
 */
const convertExtras = (schedule, mappings, key) => {
    return schedule.map(day => {
        return {
            ...day,
            courses: day.courses.map(i => {
                if (!i || i.type === 'custom') {
                    return i;
                } else {
                    let course;
                    try {
                        course = mapCourse(mappings[i], key);
                    } catch {
                        return i;
                    }
                    return course;
                }
            })
        };
    });
};

/**
 * aggregate main schedule by dates in extra schedule
 * 
 * @param extra extra schedule
 * @param main main schedule
 * @returns constructed main schedule
 */
const convertMain = (extra, main) => {
    const schedule = [];
    extra.forEach((day, index) => {
        schedule.push({ courses: [], ...main.filter(i => i['day'] === day['day'])[0], id: index });
    });
    return schedule;
};

const isVersionSupported = version => {
    return configVersions.includes(parseInt(version));
};

/**
 * generate events
 * 
 * @param {Object} options option values should all be strings
 * @param {string} configUrl 
 * @returns events
 */
const generateEvents = (data, options) => {
    if (!isVersionSupported(data.version)) {
        throw 'Config version is not supported!';
    }

    const teachers = data.teachers;
    const classData = data.classes[options.class];
    const extras = data.extras;
    const categoriesData = data.categories;
    const classDisplayName = (data.info.grade + classData.info.name) || options.class.toString();

    if (!(teachers && classData && extras)) {
        throw 'Input data is incomplete!';
    }

    const events = [];

    /**
     * add a course to events
     * 
     * @param startTime in (server) localtime array format 
     * @param duration duration in object format
     * @param course course generated with parseCourse()
     * @param repeat recurrence rules
     * @param note note defined in extras
     */
    const addEvent = (startTime, duration, course, repeat, note) => {
        const event = {};

        const recurrence = repeat && repeat.times > 1 ? 'FREQ=DAILY;INTERVAL=' + repeat.schedulePeriod.toString() + ';COUNT=' + repeat.times.toString() : null;

        const findCategory = (subject) => {
            if (!categoriesData) {
                return null;
            }
            const categories = [];
            categoriesData.forEach(category => {
                if (category.subjects.includes(subject)) {
                    categories.push(category.name);
                }
            }
            );
            return categories;
        };

        if (course.type === 'default' || course.type === 'custom') {
            course = { voovId: classData.info.voovId || null, voovPassword: classData.info.voovPassword || null, teacher: classDisplayName + '????????????', ...course };
        }

        if (course.voovId && course.online) {
            event.url = 'wemeet://page/inmeeting?meeting_code=' + course.voovId.replace(/\s/g, '');
            event.location = '????????????: ' + course.voovId;
            event.location += course.voovPassword ? '(' + course.voovPassword + ')' : '';
            event.location = course.onlineLocation || event.location;
        } else if (course.online) {
            event.url = course.url;
            event.location = course.onlineLocation;
        } else {
            event.url = course.offlineUrl;
            event.location = course.location ? course.location : classDisplayName + '??????';
        }

        event.url = course.onlineUrl || event.url;

        const alarms = [];

        if (options.alarm !== 'false') {
            let alarmBeforeMinutes = 10;
            if (options.alarm) {
                alarmBeforeMinutes = parseInt(options.alarm);
            }

            alarms.push({
                action: 'display',
                description: '??????' + alarmBeforeMinutes.toString() + '???????????????' + course.subject + '?????????',
                trigger: {
                    minutes: alarmBeforeMinutes,
                    before: true
                }
            });

        }

        event.description = course.name || (classDisplayName + course.subject);

        event.description += '(' + course.teacher + ')';

        if (course.notes && options['hide-course-note'] !== 'true') {
            event.description += course.notes;
        }

        if ([note, classData.info.note, data.info.note].join('') && options['show-additional-info'] === 'true') {
            event.description += '\n\n' + [note, classData.info.note, data.info.note].join('\n').replace(/(^[ \t]*\n)/gm, "");
        }
        
        event.description = course.description || event.description;

        event.geo = course.geo || null;

        events.push({
            ...event,
            start: timeToUtc(startTime, data.info.timezone),
            startInputType: 'utc',
            alarms: alarms,
            duration: duration,
            title: course.subject,
            categories: findCategory(course.subject),
            recurrenceRule: recurrence,
            status: 'CONFIRMED',
            busyStatus: 'BUSY',
            productId: 'holgerhuo/schedule-to-ics'
        })
    };

    /**
     * iterate all courses over a schedule and add them to courses
     * 
     * @param timeTable 
     * @param schedule
     * @param fromDate tz corrected date
     * @param online whether this is an online period
     * @param note
     * @param overwrites 
     */
    const iterateSchedule = (timeTable, schedule, fromDate, online, note, overwrites) => {
        const mappings = { ...classData.mappings, ...overwrites.classOverwrites.mappings };
        const optionalCourseMappings = { ...data.mappings, ...overwrites.mappings };
        const teachersData = { ...teachers, ...overwrites.teachers };
        /**
         * parse course data
         * this function maps by sub-class
         * 
         * @param {string|Object} input keyword/course to inject 
         * @returns {Object} course with data
         */
        const parseCourse = (input) => {
            if (!input) {
                return false;
            }

            if (input.type === 'custom') {
                return { online: online, ...input };
            }

            let course;

            try {
                if (data.info.subClass === true) {
                    course = mapCourse(mappings[input], parseInt(options['sub-class']) - 1);
                    if (!course) {
                        if (mappings[input].length === 1) {
                            course = mappings[input][0];
                        } else {
                            return { subject: input, type: 'default', online: online };
                        }
                    }
                } else {
                    course = mappings[input][0];
                }
            } catch {
                return { subject: input, type: 'default', online: online };
            }

            if (course.type === 'optionalCourse') {
                if (!options[course.key]) {
                    return { subject: input, type: 'default', online: online };
                }
                course = mapCourse(optionalCourseMappings[course.key], parseInt(options[course.key]) - 1);
            }

            const teacher = { name: course.teacher, ...teachersData[course.teacher] };

            const notes = [];

            const pushNote = (note) => {
                if (online && note.when.includes('online')) {
                    notes.push(note.msg);
                } else if (!online && note.when.includes('offline')) {
                    notes.push(note.msg);
                }
            };

            if (course.note) {
                course.note.forEach(note => {
                    pushNote(note);
                }
                );
            }

            if (teacher.note) {
                teacher.note.forEach(note => {
                    pushNote(note);
                }
                );
            }

            return { skipBreak: true, online: online, ...teacher, name: null, ...course, id: null, teacher: teacher.displayName || teacher.name + "??????", notes: notes.join('\n').replace(/(^[ \t]*\n)/gm, "") || null };
        };

        const date = convertTime(fromDate);

        const duration = timeTable.duration || { hours: 0, minutes: 40 };
        const breakDuration = timeTable.breakDuration || { hours: 0, minutes: 10 };

        const addDuration = (...duration) => {
            const sum = (ints) => {
                let sum = 0;
                ints.forEach(i => sum = sum + i);
                return sum;
            };

            const addedHours = sum(duration.map(i => i.hours));
            const addedMinutes = sum(duration.map(i => i.minutes));

            let addedDuration;

            if (addedMinutes > 60) {
                addedDuration = { hours: addedHours + Math.floor(addedMinutes / 60), minutes: addedMinutes % 60 };
            } else {
                addedDuration = { hours: addedHours, minutes: addedMinutes };
            }
            return addedDuration;
        };

        schedule.forEach(day => {
            let classCount = 0;
            const courses = day.courses.map(c => parseCourse(c));

            courses.forEach((course, i) => {
                if (classCount !== i) {
                    return; // skip merged courses
                }

                const times = timeTable.days[day['day']];

                const unmergeableBreaks = times[times.length - 1].length > 0 ? timeTable.unmergeableBreaks || [] : times[times.length - 1].unmergeableBreaks || [];

                const longerBreaks = times[times.length - 1].length > 0 ? timeTable.longerBreaks || [] : times[times.length - 1].longerBreaks || [];

                const startTime = convertTime(date).slice(0, 3);
                startTime.push(times[classCount][0], times[classCount][1]);

                classCount = classCount + 1;

                if (!course) {
                    return; // skip non-existent course
                }

                let addedDuration = times[classCount - 1][2] || duration;

                if (online === true && options['enable-merge'] === "true") {
                    while (courses[classCount] && courses[classCount].subject === courses[classCount - 1].subject && !unmergeableBreaks.includes(classCount) && !course.noMerge && !(course.noMergeOnLongerBreaks && longerBreaks.includes(classCount))) {
                        classCount = classCount + 1;
                        addedDuration = addDuration(addedDuration, times[classCount - 1][2] || duration);
                        if (!course.skipBreak) {
                            addedDuration = addDuration(breakDuration, addedDuration);
                        }
                    }
                }
                addEvent(startTime, addedDuration, course, timeTable.repeat, note);
            })
            date.add(1, 'd');
        });
    }

    // iterate over given time spans
    extras.forEach(i => {
        const fromDate = convertTime(moment(i.fromDate, "MM-DD-YYYY"));
        const scheduleExtras = convertExtras(i.schedule, i.mappings, parseInt(options.class) - 1);
        const scheduleMain = convertMain(i.schedule, classData.schedule);
        const overwrites = i.overwrites ? { teachers: i.overwrites.teachers || null, mappings: i.overwrites.mappings || null, classOverwrites: i.overwrites.classes && i.overwrites.classes[options.class] ? i.overwrites.classes[options.class] : {} } : { classOverwrites: {} }

        iterateSchedule(i.timeTable, scheduleExtras, fromDate, i.onlineClass, i.note, overwrites);
        iterateSchedule({ repeat: i.timeTable.repeat, ...data.timeTable }, scheduleMain, fromDate, i.onlineClass, i.note, overwrites);
    }
    );

    return events;
}

/**
 * 
 * @param data 
 * @param options note that options keys should be all strings  
 * @returns 
 */
const generateIcs = (data, options) => {
    const events = generateEvents(data, options);

    const { error, value } = ics.createEvents(events);

    if (error) {
        throw 'Ics module failed to generate iCal!';
    }
    return value;
}

export { generateEvents, generateIcs };
