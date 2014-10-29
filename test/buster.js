var config = module.exports;

config["JS tests"] = {
    environment: "browser",  // or "node"
    rootPath: "../",
    sources: [
        "*.js",      // Paths are relative to config file
    ],
    tests: [
        "test/*_test.js"
    ]
};
