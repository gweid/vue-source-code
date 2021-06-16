import Module from './module'
import { assert, forEachValue } from '../util'

export default class ModuleCollection {
  constructor (rawRootModule) {
    // register root module (Vuex.Store options)
    // 注册根模块，并递归注册子模块
    // rawRootModule = { state:{}, getters:{}, mutations:{}, actions:{}, modules:{} }
    this.register([], rawRootModule, false)
  }

  get (path) {
    // 如果传进来的是空数组，就不进行遍历，直接返回初始值 this.root【根模块】
    return path.reduce((module, key) => {
      return module.getChild(key)
    }, this.root)
  }

  /**
  * 根据模块是否有命名空间来设定一个路径名称
  * 例如：A 为父模块，B 为子模块:
  *   若 A 模块命名空间为 moduleA, B 模块未设定命名空间时; 则 B 模块继承 A 模块的命名空间，为 moduleA/
  */
  getNamespace (path) {
    let module = this.root
    return path.reduce((namespace, key) => {
      module = module.getChild(key)
      return namespace + (module.namespaced ? key + '/' : '')
    }, '')
  }

  update (rawRootModule) {
    update([], this.root, rawRootModule)
  }

  // 注册根模块，并递归注册子模块
  // rawModule = { state:{}, getters:{}, mutations:{}, actions:{}, modules:{} }
  register (path, rawModule, runtime = true) {
    // 非生产环境 断言判断用户自定义的模块是否符合要求
    if (process.env.NODE_ENV !== 'production') {
      assertRawModule(path, rawModule)
    }

    // 创建一个新模块
    const newModule = new Module(rawModule, runtime)

    if (path.length === 0) {
      // 在执行构造器函数 constructor 时： this.register([], rawRootModule, false)
      // 说明：根模块，path 是空数组 []，将根模块挂载到 this.root
      this.root = newModule
    } else {
      // 如果是子模块，进到这里
      // 首先，找到子模块的父模块
      // [1].slice(0, -1) 结果是：[]，代表父模块是 根模块，1 就是当前子摸快
      //   如果是 [1, 2]， 结果是: [1]，代表父模块是 1，1 的父模块是 根模块
      //   因为在 vuex 中，modules 里面还可以嵌套 modules
      const parent = this.get(path.slice(0, -1))
      // 将子模块添加到父模块的 _children 上；newModule 是根据当前子模块创建的
      // 实际上就是类似：parent: { _children: { 当前子模块名: newModule } }
      parent.addChild(path[path.length - 1], newModule)
    }

    // register nested modules
    // 递归 modules 进行子模块注册
    if (rawModule.modules) {
      // export function forEachValue (obj, fn) {
      //   Object.keys(obj).forEach(key => fn(obj[key], key))
      // }
      forEachValue(rawModule.modules, (rawChildModule, key) => {
        // 如果还有 modules，递归注册
        this.register(path.concat(key), rawChildModule, runtime)
      })
    }
  }

  unregister (path) {
    const parent = this.get(path.slice(0, -1))
    const key = path[path.length - 1]
    if (!parent.getChild(key).runtime) return

    parent.removeChild(key)
  }

  isRegistered (path) {
    const parent = this.get(path.slice(0, -1))
    const key = path[path.length - 1]

    return parent.hasChild(key)
  }
}

function update (path, targetModule, newModule) {
  if (process.env.NODE_ENV !== 'production') {
    assertRawModule(path, newModule)
  }

  // update target module
  targetModule.update(newModule)

  // update nested modules
  if (newModule.modules) {
    for (const key in newModule.modules) {
      if (!targetModule.getChild(key)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[vuex] trying to add a new module '${key}' on hot reloading, ` +
            'manual reload is needed'
          )
        }
        return
      }
      update(
        path.concat(key),
        targetModule.getChild(key),
        newModule.modules[key]
      )
    }
  }
}

const functionAssert = {
  assert: value => typeof value === 'function',
  expected: 'function'
}

const objectAssert = {
  assert: value => typeof value === 'function' ||
    (typeof value === 'object' && typeof value.handler === 'function'),
  expected: 'function or object with "handler" function'
}

const assertTypes = {
  getters: functionAssert,
  mutations: functionAssert,
  actions: objectAssert
}

function assertRawModule (path, rawModule) {
  Object.keys(assertTypes).forEach(key => {
    if (!rawModule[key]) return

    const assertOptions = assertTypes[key]

    forEachValue(rawModule[key], (value, type) => {
      assert(
        assertOptions.assert(value),
        makeAssertionMessage(path, key, type, value, assertOptions.expected)
      )
    })
  })
}

function makeAssertionMessage (path, key, type, value, expected) {
  let buf = `${key} should be ${expected} but "${key}.${type}"`
  if (path.length > 0) {
    buf += ` in module "${path.join('.')}"`
  }
  buf += ` is ${JSON.stringify(value)}.`
  return buf
}
