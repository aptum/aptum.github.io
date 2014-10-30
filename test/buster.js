var config = module.exports;

config["JS tests"] = {
    environment: "browser",  // or "node"
    rootPath: "../",
    sources: [
        "*.js",
    ],
    tests: [
        "test/*_test.js"
    ]
};
