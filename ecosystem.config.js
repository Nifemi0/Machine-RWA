module.exports = {
  apps: [
    {
      name: "machina-server",
      script: "./src/server.js",
      cwd: "/root/machina-rwa",
      watch: false,
      env: {
        NODE_ENV: "production",
        MACHINE_PORT: 8090
      }
    },
    {
      name: "machina-agent",
      script: "./src/agent.js",
      cwd: "/root/machina-rwa",
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
