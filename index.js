const assignmentNotifier = require('./assignment-notifier');
const redis = require('./redis');

assignmentNotifier().then(() => {
	redis.end(true);
	console.log('done.');
});
