export default function registerLog(instance) {
  instance.registerHelper('log', function(...messages) {
    if (messages.length === 0) {
      return;
    }

    const options = messages.pop();
    let level = 1;
    if (options.hash?.level != null) {
      level = options.hash.level;
    } else if (options.data?.level != null) {
      level = options.data.level;
    }

    instance.log(level, ...messages);
  });
}
