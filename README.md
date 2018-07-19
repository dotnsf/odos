# BlueCMS


## Overview

BlueCMS is one of CMS(Contant Management System) implementation with Node.js( as application server ) and IBM Cloudant( as datastore ).

BlueCMS can integrate with IBM Watson NLC(Natural Language Classifier) only if you set credential information of IBM Watson NLC. No extra customization needed.


## Key features

- Minumum infrastructure: Node.js and IBM Cloudant

    - You can use IBM Cloud Lite Account for free.

- Users, Documents, and Attachments can be managed in BlueCMS.

    - Not only users and documents, you can manage attachments with BlueCMS.

    - BlueCMS would store attachments information in DB. No extra network file systems or file storages are needed.

- Built-on IBM Watson NLC(Natural Language Classifier) integration

    - You can train IBM Watson NLC with your contents' information, and ask IBM Watson NLC which category would be appropriate for your specific contents.

- i18n ready

    - Default resource is only English. But you can extend other language if you can prepare(translate) its resource file.


## Other Key technology components

- [Express](https://www.npmjs.com/package/express)

    - Node.js web framework

- [EJS](https://www.npmjs.com/package/ejs)

    - JavaScript UI template engine

- [Bootstrap](https://getbootstrap.com/)

    - UI Framework

- [nicEdit](http://nicedit.com/)

    - WYSIWYG Editor


## Prerequisites

- IBM Cloud account

    - You can signup IBM Cloud Lite Account for free. But in this account, you can **not** use IBM Watson NLC(Natural Language Claasifier).

- Node.js application server

    - I strongly recommend to use IBM Cloud, SDK for Node.js runtime, just because it would be very easy to setup.

- IBM Cloudant service instance

    - You can choose Lite plan of IBM Cloudant for free.

    - You do **not** need to create database for this application on IBM Cloudant. If target database would not be existed, application would recognize it need to create new one, and also create some required design documents automatically when starting.

- (Option)IBM Watson NLC(Natural Language Classifier) service instance

    - You can **not** create this service instance if you would use IBM Cloud Lite Account.


## Setup

- For users of IBM Cloud:

    - In IBM Cloud, create Node.js runtime, IBM Cloudant service, and IBM Watson NLC service.

    - In IBM Cloud console, you need to **bind** Node.js runtime to IBM Cloudant and NLC instances.

- For non-IBM Cloud users

    - Edit settings.js with your prefered username, password.

- Customize settings.js

    - You might change settings.js for your preference:

        - exports.db_username

            - Username for IBM Cloudant

            - You can leave this value blank if you use IBM Cloud and you bind IBM Cloudant to your runtime.

        - exports.db_password

            - Password for IBM Cloudant

            - You can leave this value blank if you use IBM Cloud and you bind IBM Cloudant to your runtime.

        - exports.db_name

            - Database name for IBM Cloudant

            - Default value is **bluecms**

        - exports.app_port

            - Application port number

            - Default value is **0**

            - You can leave this value 0 if you use AppEnv.port dynamically( or you use IBM Cloud environment).

            - If you leave this value 0 and you don't use AppEnv.port dynamically( or you use IBM Cloud environment), Application would be run on port 3000.

        - exports.app_theme

            - Application template's theme

            - Default value is **default**

            - If you want to customize UI theme, you can do that if you prepare another theme, put them under templates/XXXX/ folder, and set this value as XXXX

        - exports.search_analyzer

            - Language for IBM Cloudant search index.

            - Default value is **japanese**. This means you can full-text search documents in Japanese.

        - exports.superSecret

            - Seed string for encryption.

            - Default value is **welovebluecms**

            - You can change this value at setup. You can **NOT** change this value after you create documents.

        - exports.nlc_username

            - Username for IBM Watson NLC service

            - You can iginore this parameter if you don't integrate IBM Watson NLC.

            - You can leave this value blank if you use IBM Cloud and you bind IBM Watson NLC to your runtime.

        - exports.nlc_password

            - Password for IBM Watson NLC service

            - You can iginore this parameter if you don't integrate IBM Watson NLC.

            - You can leave this value blank if you use IBM Cloud and you bind IBM Watson NLC to your runtime.

        - exports.nlc_name

            - Metadata name for IBM Watson NLC service

            - You can iginore this parameter if you don't integrate IBM Watson NLC.

        - exports.nlc_language

            - Metadata language for IBM Watson NLC service

            - You can iginore this parameter if you don't integrate IBM Watson NLC.

        - exports.nlc_url

            - URL for IBM Watson NLC API

            - You can iginore this parameter if you don't integrate IBM Watson NLC.

            - You can leave this value blank if you use default value of IBM Watson NLC API server, or you use IBM Cloud and you bind IBM Watson NLC to your runtime.


## Install

- Prepare Node.js and npm.

- Download or Git clone this source code from https://github.com/dotnsf/bluecms.git

- Open terminal, and change directory for this source code.


## Run on local server

- ``$ npm install``

- ``$ node app``


## Run on IBM Cloud

- Confirm your exports.app_port is **0(zero)** in settings.js .

- Install cf command line tool for your platform, if not done this.

    - https://github.com/cloudfoundry/cli/releases

    - Confirm you installed it successfully:

        - ``$ cf -v``

- Login to IBM Cloud with your browser

    - http://bluemix.net/

- Create **IBM Cloudant** service instance for datastore.

    - Assume you create this instance in US-SOUTH region.

    - You can choose lite plan for free(with restriction)

- (Option)Create **IBM Watson Natural Language Classifier** service instance.

    - You need to create it in same region of IBM Cloudant.

    - You can use free tier with limitation.

- Create **SDK for Node.js** runtime instance.

    - Name need to be unique.

    - You need to create it in same region of IBM Cloudant.

    - If you choose single instance with memory size under 512MB, and no other runtime would not be run, cost of this runtime would be under free tier.

- Bind **SDK for Node.js** and **IBM Cloudant**(, and **IBM Watson NLC** ).

    - You can bind runtime and service only if they are created in same region.

- Open terminal or command prompt, and operate following commands:

    - Login to IBM Cloud:

        - ``$ cf login -a https://api.ng.bluemix.net/ -u (Your IBM ID)``

            - If you created your instances in US-EAST region, you need to replace **ng** into **us-east** above.

            - If you created your instances in EU-GB region, you need to replace **ng** into **eu-gb** above.

            - If you created your instances in EU-DE region, you need to replace **ng** into **eu-de** above.

            - If you created your instances in AU-SYD region, you need to replace **ng** into **au-syd** above.

    - Push your code into your runtime:

        - ``$ cf push (Your runtime name)``


## Create very first admin user(s)

- You need to create user(s) with admin role(user.role = 0) just after you run application server at very first time.

    - ``$ curl -XPOST -H 'Content-Type: application/json' 'http://localhost:3000/adminuser' -d '{"id":"abc@xyz.com","password":"yourpassword","name":"yourname","email":"abc@xyz.com"}'``

    - You can omit "id" if you use default value("admin").

    - You can omit "name" if you use same value of "id".

    - You can omit "email" if you use default value("admin@admin").

    - You can **NOT** omit "password".

    - You can **NOT** set role. In this API, role would be always set to 0(zero), which means administrator.

- After you create at least one admin role user(s), you can delete this REST API(POST /adminuser) from app.js


## Using web application

- Browse with your web browser.

    - For example. http://localhost:3000/

- You can view current documents without login.

- You can go administrative page from upper-right hotspot. You will be asked to login.

    - Users, who have role=0, can create/edit/delete other users.

    - All users can create/edit/delete documents and attachments.


## Bulk operation

- You can bulk-insert multiple documents with following commands:

    - ``$ node bulk_docs.js -i -u(username) -p(password) <-f(filename)>``

        - **-i** : insert mode

        - **-u(username)** : username

            - Do not put spaces(blanks) between -u and username. For example, -uusername

        - **-p(password)** : password

            - Do not put spaces(blanks) between -p and password. For example, -ppassword

        - **-f(filename)** : insert documents' file

            - You can omit this parameter. In that case, **documents.json** would be used.

            - Do not put spaces(blanks) between -f and filename. For example, -ffilename

            - You can refer documents.json file for this file's format.

- You can bulk-delete all documents(except for users and attachments) with following commands:

    - ``$ node bulk_docs.js -d``


## IBM Watson NLC(Natural Language Classifier) integration

- BlueCMS can integrate with IBM Watson NLC.

    - From administrative page, you see/can click 'updateNLC' button, if you setup BlueCMS with IBM Watson NLC.

    - If you click that button, current documents information would be sent to your IBM Watson NLC instance, and that instance would be initialized with your information.

        - More specifically, combinations of **body** and **category** from your all documents would be sent as training data for classification. And they will learn trend and tendency based on your information. This operation need time to complete(about 15-30 minites).

        - You can check learning status if you click 'NLC status' button.

    - After training complete(status = 'Available'), you can ask IBM Watson NLC to find appropriate category for your body.

        - After you input body field in document edit area, you can click 'classify' button to ask IBM Watson NLC. Then you will find IBM Watson NLC's answer in category field.


## References

- npm - @cloudant/cloudant

    - https://www.npmjs.com/package/@cloudant/cloudant

- npm - Watson Developer Cloud

    - https://www.npmjs.com/package/watson-developer-cloud

- Watson Developer Cloud : Natural Language Classifier V1 API

    - http://watson-developer-cloud.github.io/node-sdk/master/classes/naturallanguageclassifierv1.html


## Licensing

This code is licensed under MIT.

https://github.com/dotnsf/bluecms/blob/master/LICENSE


## Copyright

2018 [K.Kimura @ Juge.Me](https://github.com/dotnsf) all rights reserved.
