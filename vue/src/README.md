#### vue 源码目录

├── compiler       # 编译相关
├── core           # 核心代码
├── platforms      # 不同平台的支持
├── server         # 服务端渲染
├── sfc            # .vue 文件解析
├── shared         # 共享代码

#### compiler
- 这个文件夹主要是 Vue 编译相关的，包括把模板解析成 AST 语法树，标记静态节点，生成渲染树等
- 编译是消耗性能的工作，最好在构建前做，利用 webpack 和一些 loader

#### core
- 核心代码，包含内置组件、全局 api 封装、Vue 实例化、响应式、观察者、虚拟 Dom、工具函数等

