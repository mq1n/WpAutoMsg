"use strict";

const csv = require("csv-parser");
const fs = require("fs");
const root = require('app-root-path');
const path = require('path');
const { WAConnection } = require("@adiwajshing/baileys");
const Logger = require("./logger");

// Required for kill process
process.title = "wpautomsg";

// Handle process exit
process.on("exit", () => {
	console.log(`App specific shutdown detected. Stack:\n${console.trace()}`);
});
// Catch ctrl+c event
process.on("SIGINT", () => {
	console.log("Console break shutdown detected.");
	process.exit(2);
});
// Catch unhandled rejection
process.on("unhandledRejection", (err) => {
	console.log(err);
	process.exit(3);
});

// Application main routine
function appMainRoutine() {
	// Keep alive
	process.stdin.resume();
	// Set encoding
	process.stdin.setEncoding("utf8");
	// Handle exit input
	process.stdin.on("data", (data) => {
		if (data.toString().trim() === "exit") {
			process.exit(0);
		}
	});

	// Check if phonebook file exists
	const phonebookFile = `${root}${path.sep}phonebook.csv`;
	if (!fs.existsSync(phonebookFile)) {
		console.log("Phonebook file not found.");
		process.exit(1);
	}

	// Read CSV phonebook file
	const phonebook = [];
	fs.createReadStream(phonebookFile)
		.pipe(csv({ separator: '\t' }))
		.on('data', (data) => {
			phonebook.push(data);
		})
		.on("end", () => {
			logger.info(`Phonebook file read. ${phonebook.length} entries.`);
		})

	// Create logger
	const log = new Logger();
	log.initialize();

	// Create connection
	const conn = new WAConnection();

	// Setup callbacks
	// when a new QR is generated, ready for scanning
	conn.on("qr", (qr) => {
		logger.info(`QR code generated: ${qr}`);
	});
	// when the connection has opened successfully
	conn.on("open", (result) => {
		logger.info(`Connection opened. Result: ${result}`);
	});
	// when the connection is opening
	conn.on("connecting", () => {
		logger.info(`Connection opening...`);
	});
	// when the connection has closed
	conn.on("close", (err) => {
		logger.info(`Connection closed. Reason: ${err.reason}`);
	});
	// when the socket is closed
	conn.on("ws-close", (err) => {
		logger.info(`Socket closed. Reason: ${err.reason}`);
	});
	// when the connection to the phone changes
	conn.on("connection-phone-change", (state) => {
		logger.info(`Connection to phone changed. ${state}`);
	});
	// when contacts are sent
	conn.on("contacts-received", (u) => {
		logger.info(`Contacts received. ${u.updatedContacts.length}`);
	});
	// when all initial messages are received from WA
	conn.on("initial-data-received", (update) => {
		logger.info(`Initial data received. ${update.chatsWithMissingMessages.length}`);
	});
	// when all messages are received
	conn.on("chats-received", async ({ hasNewChats }) => {
		logger.info(`You have ${conn.chats.length} chats, new chats available: ${hasNewChats}`);

		const unread = await conn.loadAllUnreadMessages();
		logger.info(`You have ${unread.length} unread messages`);
	});
	// when a chat updated(new message, updated message, read message, deleted, pinned, presence updated etc)
	conn.on("chat-update", (chatUpdate) => {
		if (chatUpdate.messages && chatUpdate.count) {
			const message = chatUpdate.messages.all()[0];
			logger.info(message);
		} else {
			logger.info(chatUpdate);
		}
	});

	// Connect to WhatsApp
	conn.connect()
		.then(() => {
			logger.info(`Succesfully connected to WhatsApp!`);
		})
		.catch(() => {
			logger.error(`Failed to connect to WhatsApp!`);
			process.exit(1);
		});
}

// Entry
try {
	appMainRoutine();
} catch (e) {
	console.error(`Exception: ${e}`);
	process.exit(1);
}
