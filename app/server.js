const log4js = require('log4js')
const { program: optionparser } = require('commander')

const Mk8sCrHandler = require("./mk8s-cr-handler.js");
const Reconciler = require("./reconciler");

// ------------------------------------------------
// Parse command line options
// ------------------------------------------------

let options = optionparser
	.storeOptionsAsProperties(true)
	.option('-v, --verbose', "Display verbose output", false)
	.option('--crd-file <filename>', 'CRD filename', './config/micro-k8s-crd-def-v1beta1.yaml')
	.option('--namespace <ns>', 'Kubernetes namespace', 'default')
	.option('--reconcile-interval <ms>', "Reconcile interval in millis", 5 * 1000)
	.option('--mode <mode>', 'The mode to start the app in (development or production)', 'production')
	.option('--hostname <hostname>', 'Hostname to use for constructing the status report URL', 'localhost')
	.option('--port <port>', 'Port to start the status collection server on', 8080)
	.option('--image <image>', 'Docker image (and tag) to use', 'farberg/edsc-microk8s-playbook')
	.option('--image-pull-policy <policy>', 'Image pull policy to use for the pod spec', 'IfNotPresent')
	.option('--dump-open-files <filename>', 'Dump list of open files of the process to this file', undefined)
	.version('0.0.1alpha')
	.addHelpCommand()
	.parse()
	.opts()

// ------------------------------------------------
// Set global log level options
// ------------------------------------------------

let logLevel = options.verbose ? "debug" : "info";

function getLogger(name) {
	let log = log4js.getLogger(name);
	log.level = logLevel;
	return log
}

// ------------------------------------------------
// Create options to be used for the app
// ------------------------------------------------

options = Object.assign({}, options, {
	logger: getLogger
})

// ------------------------------------------------
// Main
// ------------------------------------------------

async function main(options) {
	const logger = getLogger("main")
	logger.debug(`Starting with options`, options)

	//Create reconciler
	const reconcileHandler = new Mk8sCrHandler(Object.assign({}, { getLogger }, options));
	const reconciler = new Reconciler(Object.assign({}, { getLogger, reconcileHandler }, options))
	await reconciler.start();
}

// ------------------------------------------------
// Start main method
// ------------------------------------------------

(async () => main(options)
	.then(() => console.log("Main done"))
	.catch(e => { console.log("Error in main: ", e); process.exit(1) })
)();

if (options.dumpOpenFiles) {
	const fs = require('fs')
	const path = require('path')
	const { readlink } = require("fs");
	const dir = "/proc/self/fd"
	console.log("Dumping open files to ", options.dumpOpenFiles)

	function dumpOpenFiles() {
		try {
			if (fs.existsSync(options.dumpOpenFiles))
				fs.unlinkSync(options.dumpOpenFiles)
		} catch (e) { }

		var outFile = fs.createWriteStream(options.dumpOpenFiles, { flags: 'a' /* appending (old data will be preserved) */ })

		const files = fs.readdirSync(dir, { encoding: 'utf8', withFileTypes: true });
		files.forEach((file) => {
			if (file.isSymbolicLink()) {
				try {
					const t = fs.readlinkSync(path.join(dir, file.name))
					outFile.write(t + "\n")
				} catch (e) {
					console.log("Skipping", file.name)
				}
			}
		})
		outFile.close()
	}

	dumpOpenFiles()
	setInterval(() => dumpOpenFiles(), 30 * 1000)
}
