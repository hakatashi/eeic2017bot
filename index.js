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
