const path = require('path')

module.exports = [
	{
		"mode": "production",
		entry: {
			server: './app/server.js',
		},
		output: {
			path: path.resolve(__dirname, 'dist/')
		},
		target: 'node',
		node: {
			__dirname: false
		},
		module: {
			rules: [
				{
					test: /\.(js|jsx)$/,
					loader: 'shebang-loader'
				}
			]
		},
		//,externals: [nodeExternals()]
		//externals: { electron: "electron", emitter: "emitter", "browser-sync/lib/server/utils": "browser-sync/lib/server/utils" }
		externals: { electron: "electron", emitter: "emitter", "browser-sync/lib/server/utils": "browser-sync/lib/server/utils" }
	}
];