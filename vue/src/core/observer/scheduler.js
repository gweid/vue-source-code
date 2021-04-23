/* @flow */

import type Watcher from "./watcher";
import config from "../config";
import { callHook, activateChildComponent } from "../instance/lifecycle";

import { warn, nextTick, devtools, inBrowser, isIE } from "../util/index";

export const MAX_UPDATE_COUNT = 100;

// 定义了全局 queue 数组，用于存储 watcher
const queue: Array<Watcher> = [];

const activatedChildren: Array<Component> = [];
let has: { [key: number]: ?true } = {};
let circular: { [key: number]: number } = {};
let waiting = false;
let flushing = false;
let index = 0;

/**
 * Reset the scheduler's state.
 */
function resetSchedulerState() {
  index = queue.length = activatedChildren.length = 0;
  has = {};
  if (process.env.NODE_ENV !== "production") {
    circular = {};
  }
  waiting = flushing = false;
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0;

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now;

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance;
  if (
    performance &&
    typeof performance.now === "function" &&
    getNow() > document.createEvent("Event").timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now();
  }
}

/**
 * Flush both queues and run the watchers.
 */
function flushSchedulerQueue() {
  currentFlushTimestamp = getNow();
  flushing = true; // 将 flushing 置为 true，代表正在刷新队列
  let watcher, id;

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  // 刷新前先对队列进行排序，保证了：
  //  1、组件的更新顺序为从父级到子级，因为父组件总是在子组件之前被创建
  //  2、一个组件的用户 watcher 在其渲染 watcher 之前被执行，因为用户 watcher 先于渲染 watcher 创建
  //  3、如果一个组件在其父组件的 watcher 执行期间被销毁，则它的 watcher 可以被跳过
  queue.sort((a, b) => a.id - b.id);

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  // 使用 queue.length，动态计算队列的长度，没有缓存长度
  // 是因为在执行现有 watcher 期间队列中可能会被 push 进新的 watcher
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index];
    // 如果 watcher 中存在 before，执行 before 钩子
    // new Watcher(vm, updateComponent, noop, {
    //   before () {
    //     if (vm._isMounted && !vm._isDestroyed) {
    //       callHook(vm, 'beforeUpdate')
    //     }
    //   }
    // }, true /* isRenderWatcher */)
    if (watcher.before) {
      watcher.before();
    }
    id = watcher.id;
    has[id] = null;
    // 执行 watcher 的 run 去执行相应的更新函数进行页面更新
    // watcher.run 实际上也就是调用 updateComponent 进到页面挂载
    watcher.run();
    // in dev build, check and stop circular updates.
    if (process.env.NODE_ENV !== "production" && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1;
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          "You may have an infinite update loop " +
            (watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`),
          watcher.vm
        );
        break;
      }
    }
  }

  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice();
  const updatedQueue = queue.slice();

  // 重置，将 flushing 置为 false
  resetSchedulerState();

  // call component updated and activated hooks
  // 触发 activated
  callActivatedHooks(activatedQueue);
  // 触发 update 生命周期
  callUpdatedHooks(updatedQueue);

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit("flush");
  }
}

function callUpdatedHooks(queue) {
  let i = queue.length;
  while (i--) {
    const watcher = queue[i];
    const vm = watcher.vm;
    // 如果是渲染 watcher 并且执行了 Mounted 并且还没有卸载
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      // 执行一次 updated
      callHook(vm, "updated");
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent(vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false;
  activatedChildren.push(vm);
}

function callActivatedHooks(queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true;
    activateChildComponent(queue[i], true /* true */);
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
// 将 watcher 放进 watcher 队列 queue 中
export function queueWatcher(watcher: Watcher) {
  const id = watcher.id;
  // 如果 watcher 已经存在，则会跳过，不会重复
  if (has[id] == null) {
    // 缓存 watcher id，主要用来判断 watcher 有没有重复入队
    has[id] = true;
    if (!flushing) {
      // 如果没有处于刷新队列状态，直接入队
      queue.push(watcher);
    } else {
      // 已经在刷新队列了
      // 从队列末尾开始倒序遍历，根据当前 watcher.id 找到它大于的 watcher.id 的位置，然后将自己插入到该位置之后的下一个位置
      // 即将当前 watcher 放入已排序的队列中，且队列仍是有序的
      let i = queue.length - 1;
      while (i > index && queue[i].id > watcher.id) {
        i--;
      }
      queue.splice(i + 1, 0, watcher);
    }
    // queue the flush
    if (!waiting) {
      waiting = true;

      if (process.env.NODE_ENV !== "production" && !config.async) {
        // 如果是同步执行，直接刷新调度队列
        // Vue 默认是异步执行，一般是不会同步执行，如果改为同步执行，性能将会受到很大影响
        flushSchedulerQueue();
        return;
      }
      // nextTick 函数，vm.$nextTick、Vue.nextTick
      //   1、接收一个回调函数 flushSchedulerQueue，并将 flushSchedulerQueue 放入 callbacks 数组
      //   2、通过 pending 控制向浏览器任务队列中添加 flushCallbacks 函数
      //   3、通过事件循环的微任务、宏任务实现异步更新
      nextTick(flushSchedulerQueue);
    }
  }
}
