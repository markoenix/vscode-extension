import { OutputChannel, env, Uri } from 'vscode'
import axios from 'axios'

import SASjs from '@sasjs/adapter/node'
import { encodeToBase64 } from '@sasjs/utils'
import { Target, ServerType } from '@sasjs/utils/types'
import {
  getAuthCode,
  getClientId,
  getClientSecret,
  getServerType,
  getServerUrl,
  getTargetName,
  getUserName,
  getPassword
} from './input'
import { getAuthUrl, getTokens } from './auth'
import { saveToGlobalConfig } from './config'

export const createTarget = async (outputChannel: OutputChannel) => {
  const name = await getTargetName()
  const serverUrl = await getServerUrl()
  const serverType = await getServerType()
  const targetJson: any = {
    name,
    serverUrl,
    serverType,
    appLoc: '/Public/app'
  }
  if (serverType === ServerType.SasViya) {
    const clientId = await getClientId()
    const clientSecret = await getClientSecret()

    const authUrl = Uri.parse(getAuthUrl(serverType, serverUrl, clientId))
    outputChannel.appendLine(authUrl.toString())
    outputChannel.show()
    env.openExternal(authUrl)

    const authCode = await getAuthCode()

    const adapter = new SASjs({
      serverUrl: serverUrl,
      serverType: serverType,
      appLoc: '/Public/app',
      useComputeApi: true,
      debug: true
    })

    const authResponse = await getTokens(
      adapter,
      clientId,
      clientSecret,
      authCode,
      outputChannel
    )

    targetJson.authConfig = authResponse
  } else if (serverType === ServerType.Sas9) {
    const userName = await getUserName()
    const password = await getPassword()
    targetJson.authConfigSas9 = { userName, password: encodeToBase64(password) }
  } else if (serverType === ServerType.Sasjs) {
    const res = await axios.get(`${serverUrl}/SASjsApi/info`)
    if (res.data?.mode === 'server') {
      const clientId = await getClientId()
      const authUrl = Uri.parse(getAuthUrl(serverType, serverUrl, clientId))
      outputChannel.appendLine(authUrl.toString())
      outputChannel.show()
      env.openExternal(authUrl)

      const authCode = await getAuthCode()

      const adapter = new SASjs({
        serverUrl: serverUrl,
        serverType: serverType,
        appLoc: '/Public/app',
        debug: true
      })

      const authResponse = await getTokens(
        adapter,
        clientId,
        '',
        authCode,
        outputChannel
      )

      targetJson.authConfig = authResponse
    } else if (res.data?.mode !== 'desktop') {
      throw new Error('An unexpected error occurred while creating target.')
    }
  }

  const target = new Target(targetJson)

  await saveToGlobalConfig(target, outputChannel)

  return target
}
