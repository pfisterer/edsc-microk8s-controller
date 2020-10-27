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
					test: /\.(js|jsx|mjs)$/,
					use: ['babel-loader'],
					// https://github.com/webpack/webpack/issues/11467
					resolve: {
						fullySpecified: false
					},
					exclude: path.resolve(__dirname, 'node_modules')
				}
			]
		}
		//, externals: { electron: "electron", emitter: "emitter", "browser-sync": "browser-sync/lib/server/utils" }
	}
];