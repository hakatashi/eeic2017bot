const slack = require('./slack');
const getWiki = require('./wiki');
const redis = require('./redis');

const hour = 60 * 60 * 1000;
const now = Date.now();

const currentHour = Math.round(now % (24 * hour) / hour + 9); // UTC+9

module.exports = () => getWiki.then((wiki) => {
	return wiki.getArticleAsync('EEIC2017/課題一覧');
}).then((page) => {
	let h2 = null;
	let h3 = null;
	let dueDate = null;
	let dueTime = null;
	let content = '';

	const assignments = [];

	const pushAssignment = () => {
		if (h2 !== null && h3 !== null && dueDate !== null && dueTime !== null) {
			assignments.push({
				h2, h3, dueDate, dueTime,
				content: content.trim(),
				id: `${h2}###${h3}`,
			});
		}

		dueDate = dueTime = null;
		content = '';
	};

	page.split('\n').forEach((line) => {
		let match;

		if (match = line.match(/^==([^=]+)==$/)) {
			pushAssignment();

			const heading = match[1].trim();
			if (match = heading.match(/^\[\[.+\|(.+)\]\]$/)) {
				h2 = match[1];
			} else {
				h2 = heading;
			}

			h3 = null;
		} else if (match = line.match(/^===([^=]+)===$/)) {
			pushAssignment();
			h3 = match[1].trim();
		} else if (match = line.match(/^\*([^*]+)$/)) {
			const [name, value] = match[1].split(':').map(part => part.trim());

			if (name === '期日') {
				dueDate = value;
			} else if (name === '期限') {
				dueTime = value;
			}
		} else {
			content += `${line}\n`;
		}
	});

	pushAssignment();

	return Promise.all(assignments.map(assignment => redis.sismemberAsync('notified_assignments', assignment.id)));
}).then((results) => {
	console.log(results);
});
