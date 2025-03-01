import SASjs from '@sasjs/adapter/node'
import { ServerType, Target } from '@sasjs/utils'
import * as os from 'os'
import * as path from 'path'
import {
  window,
  ExtensionContext,
  commands,
  OutputChannel,
  ViewColumn,
  workspace
} from 'vscode'
import { getEditorContent } from '../../utils/editor'
import { createFile } from '../../utils/file'
import { getAuthConfig, getAuthConfigSas9 } from './internal/configuration'
import { selectTarget } from '../../utils/target'
import { getTimestamp } from './internal/utils'

export class ExecuteCodeCommand {
  private outputChannel: OutputChannel

  constructor(private context: ExtensionContext) {
    this.outputChannel = window.createOutputChannel('SASjs')
  }

  initialise = () => {
    const executeCodeCommand = commands.registerCommand(
      'sasjs-for-vscode.executeCode',
      () => this.executeCode()
    )
    this.context.subscriptions.push(executeCodeCommand)
  }

  private executeCode = async () => {
    this.outputChannel.appendLine('Initialising SASjs.')
    let target: Target | undefined
    try {
      target = await selectTarget(this.outputChannel)
    } catch (error: any) {
      this.outputChannel.appendLine('SASjs: Error selecting target: ')
      this.outputChannel.appendLine(error)
      this.outputChannel.appendLine(error.message)
      this.outputChannel.appendLine(JSON.stringify(error, null, 2))
      this.outputChannel.show()
    }

    if (!target) {
      window.showErrorMessage(
        'An unexpected error occurred while selecting target.'
      )
      return
    }

    const adapter = new SASjs({
      serverUrl: target.serverUrl,
      serverType: target.serverType,
      appLoc: target.appLoc,
      contextName: target.contextName,
      httpsAgentOptions: target.httpsAgentOptions,
      useComputeApi: true,
      debug: true
    })

    const currentFileContent = getEditorContent()

    if (target.serverType === ServerType.SasViya) {
      const authConfig = await getAuthConfig(target, this.outputChannel)

      await commands.executeCommand('setContext', 'isSasjsCodeExecuting', true)
      adapter
        .executeScriptSASViya(
          'vscode-test-exec',
          (currentFileContent || '').split('\n'),
          '',
          authConfig
        )
        .then(async (res) => {
          this.outputChannel.append('SASjs: Code executed successfully!')
          if (typeof res === 'object' && res.log) {
            await createAndOpenLogFile(res.log, this.outputChannel)
          } else if (typeof res === 'string') {
            await createAndOpenLogFile(res, this.outputChannel)
          }

          this.outputChannel.append(JSON.stringify(res, null, 2))
          await commands.executeCommand(
            'setContext',
            'isSasjsCodeExecuting',
            false
          )
        })
        .catch(async (e) => handleErrorResponse(e, this.outputChannel))
    } else if (target.serverType === ServerType.Sas9) {
      const { userName, password } = await getAuthConfigSas9(
        target,
        this.outputChannel
      )

      await commands.executeCommand('setContext', 'isSasjsCodeExecuting', true)
      adapter
        .executeScriptSAS9(
          (currentFileContent || '').split('\n'),
          userName,
          password
        )
        .then(async (res) => {
          this.outputChannel.append('SASjs: Code executed successfully!')
          if (typeof res === 'object') {
            await createAndOpenLogFile(JSON.stringify(res), this.outputChannel)
          } else if (typeof res === 'string') {
            await createAndOpenLogFile(res, this.outputChannel)
          }
          this.outputChannel.append(JSON.stringify(res, null, 2))
          await commands.executeCommand(
            'setContext',
            'isSasjsCodeExecuting',
            false
          )
        })
        .catch(async (e) => handleErrorResponse(e, this.outputChannel))
    } else if (target.serverType === ServerType.Sasjs) {
      const authConfig = await getAuthConfig(target, this.outputChannel)
      await commands.executeCommand('setContext', 'isSasjsCodeExecuting', true)
      adapter
        .executeScriptSASjs(currentFileContent || '', authConfig)
        .then(async (res) => {
          this.outputChannel.append('SASjs: Code executed successfully!')
          if (typeof res === 'object') {
            await createAndOpenLogFile(
              JSON.stringify(res, null, 2),
              this.outputChannel
            )
          } else if (typeof res === 'string') {
            await createAndOpenLogFile(res, this.outputChannel)
          }
          this.outputChannel.append(JSON.stringify(res, null, 2))
          await commands.executeCommand(
            'setContext',
            'isSasjsCodeExecuting',
            false
          )
        })
        .catch(async (e) => handleErrorResponse(e, this.outputChannel))
    }
  }
}

const createAndOpenLogFile = async (
  log: string,
  outputChannel: OutputChannel
) => {
  const timestamp = getTimestamp()
  const resultsPath = workspace.workspaceFolders?.length
    ? path.join(
        workspace.workspaceFolders![0].uri.fsPath,
        'sasjsresults',
        `${timestamp}.log`
      )
    : path.join(os.homedir(), 'sasjsresults', `${timestamp}.log`)

  outputChannel.appendLine(
    `SASjs: Attempting to create log file at ${resultsPath}.`
  )

  outputChannel.appendLine(`Log content: ${log}`)
  outputChannel.show()

  await createFile(resultsPath, log)
  const document = await workspace.openTextDocument(resultsPath)
  window.showTextDocument(document, {
    viewColumn: ViewColumn.Beside
  })
}

const handleErrorResponse = async (e: any, outputChannel: OutputChannel) => {
  outputChannel.appendLine('SASjs: Error executing code: ')
  outputChannel.appendLine(e)
  outputChannel.appendLine(e.message)
  outputChannel.appendLine(JSON.stringify(e, null, 2))
  outputChannel.show()

  const { log } = e
  if (log) {
    await createAndOpenLogFile(log, outputChannel)
  } else if (e.message) {
    await createAndOpenLogFile(e.message, outputChannel)
  }

  await commands.executeCommand('setContext', 'isSasjsCodeExecuting', false)
}
