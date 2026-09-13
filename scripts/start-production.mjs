// Use a Node entry point so npm start works in Windows and POSIX shells alike.
// Set the environment before importing Express and the compiled application.
process.env.NODE_ENV = 'production';
await import('../dist/index.js');
