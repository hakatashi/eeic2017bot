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
	const attachments = [];

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

	return redis.saddAsync('temp', ...assignments.map(it => it.id)).then(() => (
		Promise.all([
			redis.sdiffAsync('temp', 'notified_assignments'),
			redis.sdiffAsync('notified_assignments', 'temp'),
		])
	)).then(([additions, deletions]) => {
		attachments.push(...additions.map((id) => {
			const assignment = assignments.find(it => it.id === id);
			return {
				color: 'good',
				title: `新規登録: ${assignment.h2} ${assignment.h3} (～${assignment.dueDate})`,
				text: assignment.content,
			};
		}));

		attachments.push(...deletions.map((id) => {
			const [h2, h3] = id.split('###');
			return {
				color: 'danger',
				title: `削除: ${h2} ${h3}`,
			};
		}));

		slack.send({
			text: '',
			attachments,
		});

		return redis.delAsync('notified_assignments');
	}).then(() => {
		return redis.renameAsync('temp', 'notified_assignments');
	});
}).then((results) => {
	console.log(results);
});
