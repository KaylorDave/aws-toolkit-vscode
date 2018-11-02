/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as yaml from 'js-yaml'
import * as filesystem from '../../../shared/filesystem'
import { CloudFormation } from '../../cloudformation/cloudformation'
import { SystemUtilities } from '../../systemUtilities'

export class SamTemplateGenerator {
    private _resourceName?: string
    private _functionHandler?: string
    private _codeUri?: string
    private _runtime?: string
    private _existingTemplateFilename?: string

    public withResourceName(resourceName: string): SamTemplateGenerator {
        this._resourceName = resourceName

        return this
    }

    public withFunctionHandler(handlerName: string): SamTemplateGenerator {
        this._functionHandler = handlerName

        return this
    }

    public withCodeUri(codeUri: string): SamTemplateGenerator {
        this._codeUri = codeUri

        return this
    }

    public withRuntime(runtime: string): SamTemplateGenerator {
        this._runtime = runtime

        return this
    }

    public withExistingTemplate(templateFilename: string): SamTemplateGenerator {
        this._existingTemplateFilename = templateFilename

        return this
    }

    public async generate(filename: string): Promise<void> {
        await this.validate()

        const template: CloudFormation.Template = !!this._existingTemplateFilename
            ? await this.createTemplateFromExistingTemplate()
            : this.createTemplateFromScratch()

        const templateAsYaml: string = yaml.safeDump(template)

        await filesystem.writeFileAsync(filename, templateAsYaml, 'utf8')
    }

    /**
     * Throws an error if state is not valid
     */
    private async validate(): Promise<void> {
        if (!this._codeUri) { throw new Error('Missing value: CodeUri') }
        if (!this._resourceName) { throw new Error('Missing value: ResourceName') }

        if (!this._existingTemplateFilename) {
            if (!this._functionHandler) { throw new Error('Missing value: FunctionHandler') }
            if (!this._runtime) { throw new Error('Missing value: Runtime') }
        } else {
            await this.validateExistingTemplate()
        }
    }

    private async validateExistingTemplate(): Promise<void> {
        if (!this._existingTemplateFilename) { return }

        if (!await SystemUtilities.fileExists(this._existingTemplateFilename)) {
            throw new Error(`Template file not found: ${this._existingTemplateFilename}`)
        }

        const template: CloudFormation.Template = await CloudFormation.load(this._existingTemplateFilename)
        const templateResourceNames: Set<string> = !!template.Resources
            ? new Set(Object.keys(template.Resources))
            : new Set()

        if (!!this._resourceName && !templateResourceNames.has(this._resourceName)) {
            throw new Error(`Resource not found: ${this._resourceName}`)
        }

        const resource: CloudFormation.Resource = template.Resources![this._resourceName!]
        if (!this._functionHandler && (!resource.Properties || !resource.Properties.Handler)) {
            if (!this._functionHandler) { throw new Error('Missing value: FunctionHandler') }
        }

        if (!this._runtime && (!resource.Properties || !resource.Properties.Runtime)) {
            if (!this._runtime) { throw new Error('Missing value: Runtime') }
        }

    }

    private createTemplateFromScratch(): CloudFormation.Template {
        const resources: {
            [key: string]: CloudFormation.Resource
        } = {}

        resources[this._resourceName!] = {
            Type: 'AWS::Serverless::Function',
            Properties: {
                Handler: this._functionHandler!,
                CodeUri: this._codeUri!,
                Runtime: this._runtime!
            }
        }

        return {
            Resources: resources
        }
    }

    private async createTemplateFromExistingTemplate(): Promise<CloudFormation.Template> {
        const template: CloudFormation.Template = await CloudFormation.load(this._existingTemplateFilename!)
        const resource: CloudFormation.Resource = template.Resources![this._resourceName!]

        resource.Properties!.CodeUri = this._codeUri!

        if (!!this._functionHandler) {
            resource.Properties!.Handler = this._functionHandler
        }

        if (!!this._runtime) {
            resource.Properties!.Runtime = this._runtime
        }

        return template
    }
}