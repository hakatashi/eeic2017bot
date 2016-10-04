const redis = require('redis');
const Promise = require('bluebird');

Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);

const client = redis.createClient({
	host: process.env.REDIS_URL || '127.0.0.1',
	port: 6379,
});

module.exports = client;
