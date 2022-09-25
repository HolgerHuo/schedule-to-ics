# schedule-to-ics
A nodejs/express api server to convert JSON based school schedules to ics (iCal) feed.

## What is this?

`STI` is a full-fleged Schedule To ICS(iCal) converter with many customization and extension opportunities. Target users are high school students with optional courses/dynamic schedule. 

(The project could probably used for other purposes, but more configuration may be needed)

## How to use?

You can deploy it on a server using `npm start` (systemd service provided at [sti.service](https://github.com/HolgerHuo/schedule-to-ics/blob/main/dist/sti.service).

(DONT FORGET TO COPY .env.sample TO .env AND MODIFY THEM ACCORDINGLY)

It is also possible to deploy this on vercel (thank you for your great service!) using the button below:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FHolgerHuo%2Fschedule-to-ics&env=DATASOURCE,NODE_ENV&project-name=schedule-to-ics&repo-name=schedule-to-ics)

## Where is frontend?

I've written a **non-generic** frontend for TFLS G3 students (including documentation on how to use these feeds) and it can be visited from [https://mtoolkit.r669.live/sti-ui](https://mtoolkit.r669.live/sti-ui) (also open-sourced at https://github.com/HolgerHuo/mtoolkit). I'll write a more generic frontend some day.

## How do I write 'data'?

I'll take out a more specified documentation (hopefully some time around Jan. 2023) but I'm currently MORE THAN busy. You can have a look at the [demo-data.json](https://github.com/HolgerHuo/schedule-to-ics/blob/main/dist/demo-data.json) and most of them are easy to understand (i guess).

## Credits

- [ics(node_module)](https://github.com/adamgibbons/ics)
- [moment.js](momentjs.com/)
- [Express.js](expressjs.com/)

Special thanks to [Vercel](https://vercel.com) for hosting many serverless functions for me.

## License

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.en.html)