// CSS Modules: each class name maps to the generated, scoped name.
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
