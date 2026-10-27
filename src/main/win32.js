'use strict';

// Chamadas diretas à API do Windows via koffi (FFI): qual janela está em
// primeiro plano e se um modificador está fisicamente pressionado.

const path = require('node:path');
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

const GetForegroundWindow = user32.func('void * __stdcall GetForegroundWindow()');
const GetWindowThreadProcessId = user32.func(
  'uint32_t __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32_t *pid)',
);
const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(void *hWnd, _Out_ uint16_t *buf, int max)');
const GetAsyncKeyState = user32.func('int16_t __stdcall GetAsyncKeyState(int vKey)');
const OpenProcess = kernel32.func('void * __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)');
const QueryFullProcessImageNameW = kernel32.func(
  'bool __stdcall QueryFullProcessImageNameW(void *h, uint32_t flags, _Out_ uint16_t *buf, _Inout_ uint32_t *size)',
);
const CloseHandle = kernel32.func('bool __stdcall CloseHandle(void *h)');

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

const VK = {
  Ctrl: [0x11],
  Alt: [0x12],
  Shift: [0x10],
  Meta: [0x5b, 0x5c],
};

function isModifierDown(name) {
  const codes = VK[name];
  if (!codes) return true;
  return codes.some((vk) => (GetAsyncKeyState(vk) & 0x8000) !== 0);
}

function foregroundWindow() {
  const hwnd = GetForegroundWindow();
  if (!hwnd) return { pid: 0, exePath: '', exe: '', title: '' };

  const pid = [0];
  GetWindowThreadProcessId(hwnd, pid);

  const titleBuf = Buffer.alloc(1024);
  const titleLen = GetWindowTextW(hwnd, titleBuf, 512);
  const title = titleBuf.toString('utf16le', 0, titleLen * 2);

  let exePath = '';
  const handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid[0]);
  if (handle) {
    const pathBuf = Buffer.alloc(2048);
    const size = [1024];
    if (QueryFullProcessImageNameW(handle, 0, pathBuf, size)) {
      exePath = pathBuf.toString('utf16le', 0, size[0] * 2);
    }
    CloseHandle(handle);
  }

  return { pid: pid[0], exePath, exe: exePath ? path.basename(exePath).toLowerCase() : '', title };
}

module.exports = { foregroundWindow, isModifierDown };
