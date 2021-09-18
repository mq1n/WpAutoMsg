'use strict';

const util = require("util");
const fs = require("fs");
const root = require('app-root-path');
const path = require('path');
const winston = require("winston");
require("winston-daily-rotate-file");

module.exports = class Logger {
	constructor() {
		this._initialized = false;
		this._customLogLevels = {
			levels: {
				crit: 0,
				error: 1,
				warning: 2,
				info: 3,
				debug: 4
			},
			colors: {
				crit: "bold red",
				error: "yellow",
				warning: "gray",
				info: "gray",
				debug: "gray"
			}
		};
	}

	initialize() {
		// Log path
		const logPath = `${root}${path.sep}logs`;

		// Create log folder
		if (!fs.existsSync(logPath)) {
			console.log(`log path: ${logPath} does not exist!`);

			fs.mkdirSync(logPath);
			if (!fs.existsSync(logPath)) {
				throw `log path create failed!`;
			}
		}

		// Create write stream for forward console logs
		const systemLogStream = fs.createWriteStream(`${logPath}${path.sep}sys.log`, { flags : "a" });
		systemLogStream.on('error', (err) => {
			throw `sys log stream error: ${err}`;
		});

		// Get stdout stream
		const stdoutStream = process.stdout;

		// Mirror console.log to file
		global.console.log = (buffer) => {
			const datetime = new Date();
			systemLogStream.write(`[${datetime}] \n${util.format(buffer)}\n`);
			stdoutStream.write(`[${datetime}] \n${util.format(buffer)}\n`);
		};

		// Create log file rotator
		const transport = new winston.transports.DailyRotateFile({
			filename: `${logPath}${path.sep}application-%DATE%.log`,
			datePattern: "YYYY-MM-DD-HH",
			zippedArchive: false,
			maxSize: "20m",
			maxFiles: "14d"
		});
		transport.on("rotate", (oldFilename, newFilename) => {
			console.log(`Forwarding log file: ${oldFilename} to: ${newFilename}`);
		});
		transport.on("archive", (zipFilename) => {
			console.log(`Archived log file: ${zipFilename}`);
		});

		// Create logger
		const logger = winston.createLogger({
			level: "debug",
			levels: this._customLogLevels.levels,
			format: winston.format.combine(
				winston.format.colorize(),
				winston.format.timestamp(),
				winston.format.printf(info => {
					return `${info.timestamp} ${info.level}: ${info.message}`;
				})
			),
			transports: [
				new winston.transports.Console(),
				new winston.transports.File({ filename: `${logPath}/error.log`, level: "error" }),
				new winston.transports.File({ filename: `${logPath}/fatal_error.log`, level: "crit" }),
				transport
			]/*,
			exceptionHandlers: [
				new winston.transports.File({ filename: `${logPath}/exceptions.log` })
			]
			,
			rejectionHandlers: [
				new winston.transports.File({ filename: `${logPath}/rejections.log` })
			]*/
		});
		winston.addColors(this._customLogLevels.colors);

		logger.error = err => {
			if (err instanceof Error) {
				logger.log({ level: 'error', message: `${err.stack || err}` });
			} else {
				logger.log({ level: 'error', message: err });
			}
		};
		global.logger = logger;

		const datetime = new Date();
		logger.info(`Log engine initialized! ${datetime}`);

		this._initialized = true;
	}
};
