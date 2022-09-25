import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import eah from 'express-async-handler';
import createError from 'http-errors';

import fetchJson from './lib/fetchJson.js';
import { generateIcs } from './lib/sti.js';

const dataSource = process.env.DATASOURCE;

if (!dataSource) {
    console.log('No valid data source provided!');
    process.exit();
}

const corsOptions = {
    origin: process.env.CORS_ORIGIN || "*",
};

const app = express();
const port = process.env.PORT || 3000;

// root handler
app.get('/', (req, res) => {
    res.set('Cache-Control', `s-maxage=${process.env.ROOT_S_MAXAGE || '86400'},max-age=${process.env.ROOT_MAX_AGE || '86400'}, stale-while-revalidate`);
    res.send(process.env.ROOT_MSG || "<span style='font-weight: bold'>schedule-to-ics</span> server is now up and running! <br><h3>Usage</h3><br><code>GET</code> /:school/:grade/:class/schedule.ics?sub-class=:subClass&opt1=:opt1<br><br><span style='font-weight: bold'>schedule-to-ics</span> is open-source software and is licensed under AGPL-3.0. You can check out its repo at <a href='https://github.com/HolgerHuo/schedule-to-ics' target='_blank'>https://github.com/HolgerHuo/schedule-to-ics</a>.");
});

// 302 favicon
app.get('/favicon.ico', (req, res) => {
    res.redirect(process.env.FAVICON || 'https://mravatar.r669.live/avatar/holgerhuo@dragon-fly.club');
});

// use cors middleware
app.use(cors(corsOptions));

// ics endpoint
app.get('/:school/:grade/:class/*.ics',
    eah(async (req, res) => {
        let data;
        try {
            data = await fetchJson([dataSource, req.params.school, req.params.grade].join('/') + '/data.json');
        } catch (e) {
            throw createError(404, 'The requested iCal could not be found.', { debug: e });
        }
        let calendar;
        try {
            calendar = generateIcs(data, { ...req.params, ...req.query });
        } catch (e) {
            throw createError(500, 'The requested iCal could not be generated.', { debug: e });
        }
        res.type('text/calendar');
        res.append('iCal-Modified', data.updateDate);
        data.info.license && res.append('iCal-License', data.info.license);
        res.append('Cache-Control', `s-maxage=${process.env.S_MAXAGE || '3600'},max-age=${process.env.MAX_AGE || '3600'}, stale-while-revalidate`);
        res.send(calendar);
    })
);

// four-Oh-four handler
app.use((req, res, next) => {
    next(createError(404, 'The endpoint you\'ve requested has not yet been defined.'));
});

// error handler
app.use((error, req, res, next) => {
    const dateTime = new Date();
    console.log('Date: ', dateTime);
    console.log('URL: ', req.originalUrl);
    console.log('Status: ', error.status);
    console.log('Message: ', error.message);
    process.env.NODE_ENV !== 'production' && error.debug && console.log('Debug: ', error.debug);
    res.status(error.status);
    res.set('Cache-Control', `s-maxage=${process.env.ERROR_S_MAXAGE || '1'},max-age=${process.env.ERROR_MAX_AGE || '1'}, stale-while-revalidate`);
    res.json({
        status: error.status,
        timestamp: dateTime,
        url: req.originalUrl,
        message: error.message,
        debug: process.env.NODE_ENV !== 'production' && error.debug || undefined
    });
});

// start server
const server = app.listen(port, () => {
    console.log(`schedule-to-ics listening on port ${port}.`);
});

// handle sigterm
process.on('SIGTERM', () => {
    debug('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        debug('HTTP server closed');
    });
});
