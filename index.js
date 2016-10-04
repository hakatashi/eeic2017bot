const assignmentNotifier = require('./assignment-notifier');

assignmentNotifier().then(() => {
	console.log('done.');
});
