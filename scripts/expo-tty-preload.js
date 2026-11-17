// 包装脚本为了捕获启动日志会把子进程输出接成 pipe，Expo 检测到非 TTY 后会
// 走 "Waiting on ..." 的精简分支，不再打印二维码和交互式界面。
// 这里只伪造 isTTY（不改真实终端尺寸），输出仍然由包装脚本原样转发。
for (const stream of [process.stdout, process.stderr]) {
  if (!stream.isTTY) {
    Object.defineProperty(stream, 'isTTY', { value: true, configurable: true });
  }
}
