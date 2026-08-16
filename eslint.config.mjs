export default [
  {
    ignores: [
      "gui/**",
      "node_modules/**"
    ],
    rules: {
      // Basic Node rules
      "no-unused-vars": "warn",
      "no-undef": "off", // using Node globals
      "no-console": "off"
    }
  }
];
