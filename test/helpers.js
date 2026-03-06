export const stripWs = (s) => s.replace(/\s+/g, '');

export function createLocals(which, viewsDir, locals = {}) {
  const opts = {};
  if (which === 'express') {
    opts.settings = { views: viewsDir };
    opts.cache = process.env.NODE_ENV === 'production';
    for (const [key, value] of Object.entries(locals)) {
      opts[key] = value;
    }
  }
  return opts;
}

export function renderTemplate(render, filename, options) {
  return new Promise((resolve, reject) => {
    render(filename, options, (err, html) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(html);
    });
  });
}

export function renderTemplateResult(render, filename, options) {
  return new Promise((resolve) => {
    render(filename, options, (err, html) => {
      resolve({ err, html });
    });
  });
}
