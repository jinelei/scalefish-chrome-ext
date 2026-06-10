const log = {
  _prefix: (level) => {
    const ts = new Date().toISOString().slice(11, 23)
    return `[${ts}] [${level}] [options]`
  },
  debug: (...args) => console.debug(log._prefix('DEBUG'), ...args),
  info: (...args) => console.info(log._prefix('INFO'), ...args),
  warn: (...args) => console.warn(log._prefix('WARN'), ...args),
  error: (...args) => console.error(log._prefix('ERROR'), ...args),
}

document.addEventListener('DOMContentLoaded', () => {
  log.debug('Options page loaded')
  const backendUrl = document.getElementById('backendUrl')
  const apiToken = document.getElementById('apiToken')
  const saveBtn = document.getElementById('saveBtn')
  const status = document.getElementById('status')

  chrome.storage.sync.get(['backendUrl', 'apiToken'], (result) => {
    if (result.backendUrl) backendUrl.value = result.backendUrl
    if (result.apiToken) apiToken.value = result.apiToken
    log.debug('Loaded stored config: url=%s', result.backendUrl)
  })

  saveBtn.addEventListener('click', () => {
    const url = backendUrl.value.trim().replace(/\/+$/, '')
    const token = apiToken.value.trim()

    if (!url) {
      showStatus('请输入后端地址', 'error')
      return
    }
    if (!token) {
      showStatus('请输入 API Token', 'error')
      return
    }

    log.info('Testing connection to: %s', url)

    // Test connection
    fetch(`${url}/categories`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(() => {
        log.info('Connection successful, saving config')
        chrome.storage.sync.set({ backendUrl: url, apiToken: token }, () => {
          showStatus('保存成功！配置已生效', 'success')
        })
      })
      .catch((e) => {
        log.error('Connection failed:', e.message)
        showStatus(`连接失败: ${e.message}，请检查地址或 Token`, 'error')
      })
  })

  function showStatus(msg, type) {
    status.textContent = msg
    status.className = type
  }
})
