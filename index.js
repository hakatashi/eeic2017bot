// FIXME: Ignore all cert errors
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const assignmentNotifier = require('./assignment-notifier');
const davMonitor = require('./dav-monitor');
const redis = require('./redis');

Promise.all([
	assignmentNotifier(),
	davMonitor(),
]).then(() => {
	redis.end(true);
	console.log('done.');
});
