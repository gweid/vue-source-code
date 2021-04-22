/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop,
} from "../util/index";

import { traverse } from "./traverse";
import { queueWatcher } from "./scheduler";
import Dep, { pushTarget, popTarget } from "./dep";

import type { SimpleSet } from "../util/index";

let uid = 0;

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
 //一个组件一个 watcher（渲染 watcher）或者一个表达式一个 watcher（用户watcher）
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor(
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm;
    if (isRenderWatcher) {
      vm._watcher = this;
    }
    vm._watchers.push(this);
    // options
    if (options) {
      this.deep = !!options.deep;
      this.user = !!options.user;
      this.lazy = !!options.lazy;
      this.sync = !!options.sync;
      this.before = options.before;
    } else {
      this.deep = this.user = this.lazy = this.sync = false;
    }
    this.cb = cb;
    this.id = ++uid; // uid for batching
    this.active = true;
    this.dirty = this.lazy; // for lazy watchers
    this.deps = [];
    this.newDeps = [];
    this.depIds = new Set();
    this.newDepIds = new Set();
    this.expression =
      process.env.NODE_ENV !== "production" ? expOrFn.toString() : "";
    // parse expression for getter
    if (typeof expOrFn === "function") {
      // expOrFn 实际就是 new Watcher 传进来的 updateComponent
      // 将 expOrFn（updateComponent）赋值给 this.getter
      this.getter = expOrFn;
    } else {
      this.getter = parsePath(expOrFn);
      if (!this.getter) {
        this.getter = noop;
        process.env.NODE_ENV !== "production" &&
          warn(
            `Failed watching path: "${expOrFn}" ` +
              "Watcher only accepts simple dot-delimited paths. " +
              "For full control, use a function instead.",
            vm
          );
      }
    }
    // 如果是 lazy 代表的是 computed
    // 不是 computed，执行 this.get()
    this.value = this.lazy ? undefined : this.get();
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get() {
    // 将 watcher 添加到 Dep.target
    pushTarget(this);
    let value;
    const vm = this.vm;
    try {
      // 执行 this.getter（this.getter 就是 new Watcher 传进来 updateComponent 函数）
      // 执行更新函数，进入实例挂载阶段
      value = this.getter.call(vm, vm);
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`);
      } else {
        throw e;
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value);
      }
      // 关闭 Dep.target，Dep.target = null
      popTarget();
      this.cleanupDeps();
    }
    return value;
  }

  /**
   * Add a dependency to this directive.
   */
  // 将 dep 放到自己（watcher）上
  // 将自己（watcher）添加到 dep 的 subs 数组
  addDep(dep: Dep) {
    const id = dep.id;
    if (!this.newDepIds.has(id)) {
      // newDepIds是具有唯一成员是Set数据结构，newDeps是数组
      // 他们用来记录当前 watcher 所拥有的数据，这一过程会进行逻辑判断，避免同一数据添加多次
      this.newDepIds.add(id);
      // 将 dep 添加进 watcher.newDeps 中
      this.newDeps.push(dep);
      if (!this.depIds.has(id)) {
        // 调用 dep.addSub 将 watcher 添加进 dep
        dep.addSub(this);
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps() {
    let i = this.deps.length;
    while (i--) {
      const dep = this.deps[i];
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this);
      }
    }
    let tmp = this.depIds;
    this.depIds = this.newDepIds;
    this.newDepIds = tmp;
    this.newDepIds.clear();
    tmp = this.deps;
    this.deps = this.newDeps;
    this.newDeps = tmp;
    this.newDeps.length = 0;
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  // 根据 watcher 配置项，决定接下来怎么走，一般是 queueWatcher
  update() {
    /* istanbul ignore else */
    // lazy 为 true 代表是 computed
    if (this.lazy) {
      // 如果是 computed，则将 dirty 置为 true
      // 可以让 computedGetter 执行时重新计算 computed 回调函数的执行结果
      this.dirty = true;
    } else if (this.sync) {
      // 是否是同步 watcher
      // 同步执行，在使用 vm.$watch 或者 watch 选项时可以传一个 sync 选项，
      // 当为 true 时在数据更新时该 watcher 就不走异步更新队列，直接执行 this.run 
      // 方法进行更新
      this.run();
    } else {
      // 把需要更新的 watcher 往一个队列里面推
      // 更新时一般都进到这里
      queueWatcher(this);
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  /**
   * 刷新队列函数 flushSchedulerQueue 调用，完成如下几件事：
   *   1、执行实例化 watcher 传递的第二个参数，updateComponent 或者 获取 this.xx 的一个函数(parsePath 返回的函数)
   *   2、更新旧值为新值
   *   3、执行实例化 watcher 时传递的第三个参数，比如用户 watcher 的回调函数，或者渲染 watcher 的空函数
   */
  run() {
    if (this.active) {
      // 首先就执行 watcher.get，watcher.get 会执行更新函数进行实例挂载流程
      const value = this.get();
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value;
        this.value = value;
        if (this.user) {
          // 如果是用户 watcher，则执行用户传递的第三个参数 —— 回调函数
          try {
            // 执行回调，进行数据更新
            this.cb.call(this.vm, value, oldValue);
          } catch (e) {
            handleError(
              e,
              this.vm,
              `callback for watcher "${this.expression}"`
            );
          }
        } else {
          // 如果是渲染 watcher，第三个参数是一个空函数 this.cb = noop
          this.cb.call(this.vm, value, oldValue);
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  // 主要是 computed 的
  evaluate() {
    this.value = this.get();
    // computed 标记为已经执行过更新
    this.dirty = false;
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  // computed 中调用这个进行依赖收集
  depend() {
    let i = this.deps.length;
    while (i--) {
      this.deps[i].depend();
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown() {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this);
      }
      let i = this.deps.length;
      while (i--) {
        this.deps[i].removeSub(this);
      }
      this.active = false;
    }
  }
}
