module.exports = {
  apps: [
    {
      name: "machina-server",
      script: "./src/server.js",
      watch: false,
      env: {
        NODE_ENV: "production",
        MACHINE_PORT: 8090
      }
    },
    {
      name: "machina-agent",
      script: "./src/agent.js",
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
