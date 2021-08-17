const { keyboard, Key } = require("@nut-tree/nut-js");

keyboard.config.autoDelayMs = 0;

module.exports = async function control(action) {
  switch (action) {
    case "next":
      await keyboard.type(Key.Right);
      break;
    case "prev":
      await keyboard.type(Key.Left);
      break;
    default:
      console.info(`Ignored action of type: '${action}'`);
      break;
  }
};
