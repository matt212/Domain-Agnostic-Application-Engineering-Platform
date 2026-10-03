parameterized release notes

Bolierplate implementation parameterized applied for multiselect , multicolumn and base gen api count 

** reporting fetching from million rows  **
this indexes is catch 22 if we apply below its works great for report but distarous for group by clause (multiselect and 
multicol filter)

CREATE INDEX ix_employees_gender_lower2 ON public.employees USING btree (lower((gender)) varchar_pattern_ops, gender)
--alternative col index approach
CREATE INDEX ix_employees_last_name_lower ON public.employees USING btree (lower((last_name)) varchar_pattern_ops)



=VLOOKUP($E2,$K$2:$L$2387,2,FALSE)
Sheet1

redis-cli flushall
https://explain.dalibo.com/plan#
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
for readmes table generaor

https://www.tablesgenerator.com/html_tables

** after workstation restart **
 > *`sudo service redis-server restart` *
 > *`sudo service postgresql restart` *



** Superadmin scafolding/ boilerplate**
 > *http://127.0.0.1:3011/black-squadron*
 > *`for any other controls other than textbox it is mandatory to enter` *
 > *` | separator in textbox column for e.g genderid|gendername` *
 

** multicolumn multiselect Indexing **
 > *`create index ix_employees_col_lower on employees (lower(first_name) varchar_pattern_ops);`*

**sh file Setup**
> *`chmod +x ./app/utils/serverSetup/primarySetup.sh `*  

> *`sed -i -e 's/\r$//' ./app/utils/serverSetup/> primarySetup.sh`*

>*`chmod +x ./app/utils/serverSetup/secondarySetup.sh`*

>*`sed -i -e 's/\r$//' ./app/utils/serverSetup/secondarySetup.sh`*

>*`bash ./app/utils/serverSetup/primarySetup.sh`*

*`basic dashboard operation`*
![redlime](app/video/gif/a.gif)

*`dynamic pivot operation with highchart implementation`*
![redlime](app/video/gif/b.gif)

*`Node.js stream based CSV download for 1000k from PostgresSQL with socket.io as progress feature`*
![redlime](app/video/gif/c.gif)

**app setup**
> **node and postgres**

> **node** 
> * `sudo apt update`
> * `sudo apt install nodejs`
> * `sudo apt install npm`
>**redis**
> * `sudo apt update`
> * `sudo apt install redis-server`
> * `goto sudo nano /etc/redis/redis.conf and change from [supervised no ] to [supervised systemd]`
> * `sudo service redis-server start`
> **postgres**
> * `sudo service postgresql status`
> * `sudo apt-get update`
> * `sudo apt-get install postgresql  postgresql-contrib`
> after postgres fresh install
> * `sudo -u postgres psql postgres`
> *  `\password postgres`
> locate SHOW hba_file using  *`psql "dbname='postgres' user='postgres' password='abc123' host='localhost'" -c 'SHOW hba_file'`
>* `sudo npm install -g module --unsafe-perm`
> run * `sudo nano /etc/postgresql/12/main/pg_hba.conf`
> `change peer to m`

### try catch 
try {

} catch (error) {
      
      request.log.info({"error":error,"modname":mod.Name,"payload":request.body})
    }


> * `CREATE DATABASE demodb;`
> **uninstall node** 
> * `sudo apt-get remove nodejs`
> * `sudo apt-get remove npm`
> * `sudo apt purge nodejs`
> * `sudo apt purge npm`
> * `sudo apt-get update`
> * `sudo rm /usr/bin/node or sudo rm /usr/ocal/bin/node`

> **upgrading node**
> * `npm install -g n`
> * `n stable`

>**uninstall redis**
> *`sudo apt-get purge --auto-remove redis-server`
> **uninstall postgresql**
> * `https://askubuntu.com/questions/32730/how-to-remove-postgres-from-my-installation`
> * `sudo apt-get --purge remove postgresql`
> * `dpkg -l | grep postgres`
> * `sudo apt-get --purge remove postgresql postgresql-doc postgresql-common postgresql-12 postgresql-client-12`

**goto app folder**
> * `npm install` or `yarn`
> * `npm run preinstall` or `yarn preinstall`
> * `npm run createDB` or `yarn createDB`
> * `npm run pgRestore` or `yarn pgRestore`
> * `npm run app` or `yarn app`

**if app server deployment**
> * `npm run preinstall` or `yarn preinstall`
> * `npm run mig` or `yarn mig`
> * `npm run build` or `yarn build`

> **for enabling pivot**
> * `CREATE EXTENSION IF NOT EXISTS tablefunc`;

> **for some sequelize error** 
sudo npm install -g pg

> renaming folder 
git mv casesensitive tmp
git mv tmp CaseSensitive

> for plantUML setup with vscode
> \*refer this for windows envirnoment

- https://stackoverflow.com/questions/53856294/plantuml-extension-for-visual-studio-code-on-windows-only-working-with-sequence

> for swagger implementation in different repo

```

git clone https://github.com/swagger-api/swagger-editor.git
cd swagger-editor
npm install
npm run build
npm start

```

**_OR in same app_**

> got to root > swagger folder and use

       `swagger.yaml`

> for every time swagger file update
> run commands `yarn yaml2json`

> and access  
> http://localhost:3009/api-docs/ > **_for getting access Token to be used in swagger api_**

- goto /getAccessToken
- login with superadmin cred
- redirects to /accessTokenlisting
- click on `copy to clipboard`
- paste the same in swagger `Authorize` button overlay

> for self hosted CI 
> https://github.com/bleenco/abstruse/blob/master/docs/INSTALLATION.md#docker-image
> for windows issues
* https://github.com/ethereumjs/ethereumjs-util/issues/43
*   npm i -g uws@10.148.1 (for this issues Cannot find module 'uws')
---

**swagger routes dashboard**

> http://localhost:3009/swagger-stats/ui

**Custom fractural pattern based app** :

> things which are plug and play

- new fields (datatypes string and ints ) ,
  config based modular apporach on server side `duh`.
- validation is sly-ly implemented taken care by config based modular apporach on client side.
- <u> `modulerized everything baby` </u> concept for excel export ,import table rendering and dynamic pivot based filters !
- create, update , delete. search is implemented for single table and complex queries multi join alias based approach queries.
- every thing search, group by multiselect search is paginated to the core for effeciency and scalabliltiy.which goes without sayin is modulerized to the core .
- single set depenendences routes wherein all dependencies are imported from dependencies core.
  > **_The essence is request and response structure which in turn is based on fractural pattern which is fuel for this custom ad -hoc
  > fractural beast of an app_**.

> oOh, I forgot stream based realtime **_1000k_** yup you read that right **_1000k_**
>
> - record **_E_** import, export ,
>   **_TL_**(pivot , search multiselect multicolumn)
>   applications anything from
>   custom b2b app like crm etc .

> Work in progress
>
> - all control config and fully functional
>   (radio buttons, checkboxes, select,image gallery) is required mark for controls chanllenge is ui come all apply design schematics !
> - release builds minify and compress


> for installing  docker on ubuntu and 
 >* curl -fsSL get.docker.com -o get-docker.sh
 >*  chmod +x get-docker.sh
 >*  sudo ./get-docker.sh
 
 >  jenkins pull install 
 for running as container
  `sudo docker run -d -p 8080:8080 -p 50000:50000 jenkins/jenkins:lts`


> to recover jenkins password
* `docker exec <container> cat /var/jenkins_home/secrets/initialAdminPassword`
* current password `9977af27365e4dbe8bb2c12f74ae588f`

> to stop localhost 
sudo kill $(sudo lsof -t -i:3009)

> for installing docker compose
> *https://docs.docker.com/compose/install/

> postgres useful commands !
> * https://zaiste.net/postgresql_primer_for_busy_people/

>>**for scaffolding**
> **server side**
> * update routes in `app/utils/app.js`
> * create folder with modname and create validationConfig.js in 
> *    `app/routes/utils/{modname}/validationConfig.js`
> * create routes filename with modname with {modname and modnameid}
> *    `app/routes/{modname}.js`
> * create models for modname in 
> *    `app/models/{modname}.js`
> * create swagger .yml in 
> *  `app/utils/swagger/docs/{modname}.js `
>> **for scaffolding client side**
> * create js file for client side modname  in   
> *    `app/public/app_{modname}.js`
> * create html file in  in 
> *    `app/view/{modname}/{modname}.html`

**remove install**
> * `chmod +x ./app/utils/serverSetup/remove-Setup.sh`
> * `sed -i -e 's/\r$//' ./app/utils/serverSetup/> remove-Setup.sh`
> * `bash ./app/utils/serverSetup/remove-Setup.sh`

>**********************Important notice for complex muti control form**
for create complex file like multi checkbox for complex multi control use respective module file for insert , update and delete *do not use modular code from baseutils inherit it and use it in module js files"


Steps for using scaffolding
1.for createing new table just select textbox and enter , new table would be created along with swagger and whole nine yards.
2.for using radio , checkbox used textbox first time to create table and use its dbtable when you want use radio button in form when it is intended. 
like for e.g 
for including sex radio button in in recruits form
first create sex table in db by inputting sex in fresh scaffolding
and use swagger to input data or form 
and then you can select from sex as dbtable while creating recruits form as fresh install


>>**for Muti control access data for EDIT AND update across use interimdatapayload child object of base**
>> for restart wsl ubuntu wslconfig /t Ubuntu
>>for containerX
amisize
ebsvolume
georegion

###############upgrading nodejs#####################
curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | sh
source ~/.nvm/nvm.sh
nvm install --lts
nvm use --lts
npm --version


##################playwright commands#####################


--install 
Run these in order:

npm install -D @playwright/test
npx playwright install chromium
npx playwright --version

Then create:

playwright.config.js
playwright/tests/smoke.spec.js

using the code above.

Start your app:

yarn app or npm run app

Then, in another terminal:

npx playwright test playwright/tests/smoke.spec.js
----run- smoke.specs.js
npx playwright test smoke

HEADED=true \
npx playwright test employees -g "11 - Multi-Column Filter - Dynamic fields return matching results"

HEADED=true \
npx playwright test employees -g "13 - Multi-Column Filter - Dynamic multi-select permutations return results"



HEADED=true \
npx playwright test employees -g "16 - CRUD - Create Employee using validationmap"


HEADED=true \
npx playwright test employees -g "17 - data Form - validation using validationmap"



HEADED=true \
npx playwright test employees -g "18 - CRUD - Create and Update Employee using validationmap"



HEADED=true \
npx playwright test employees -g "21 - Multi-Column Filter - Full-word random-row multi-select permutations"


HEADED=true npx playwright test playwright/tests/employees.resilience.spec.js

HEADED=true \
npx playwright test employees -g "30 - Delete -> Active absence -> Restore -> Deleted absence lifecycle"


----18 Sept
npx playwright test playwright/tests/module.spec.js


npx playwright test module -g "25 - Newest and Oldest record navigation works correctly"

npx playwright test module -g "30 - Delete -> Active absence -> Restore -> Deleted absence lifecycle"


yarn playwright show-report playwright-report/report_2026-09-20_18-16-09 --port 9324

LOGIN_USERNAME=krennic \
LOGIN_PASSWORD=orson \
k6 run performance/employees.k6.js

HEADED=true \
SMOKE=true \
LOGIN_USERNAME=krennic \
LOGIN_PASSWORD=orson \
k6 run performance/employees.k6.js



K6_REPORT_FILE=performance/reports/employees.html \
K6_JSON_FILE=performance/reports/employees.json \
LOGIN_USERNAME=krennic \
LOGIN_PASSWORD=orson \
k6 run performance/employees.k6.js

For an immediate 100-user load:


START_VUS=100 \
TARGET_VUS=100 \
RAMP_DURATION=1s \
HOLD_DURATION=5m \
LOGIN_USERNAME=krennic \
LOGIN_PASSWORD=orson \
K6_REPORT_FILE=performance/reports/employees-100vus.html \
K6_JSON_FILE=performance/reports/employees-100vus.json \
k6 run performance/employees.k6.js

POOL_DEBUG=true yarn ap


START_VUS=20 \
TARGET_VUS=20 \
RAMP_DURATION=10s \
HOLD_DURATION=2m \
LOGIN_USERNAME=krennic \
LOGIN_PASSWORD=orson \
K6_REPORT_FILE=performance/reports/employees-20vus.html \
K6_JSON_FILE=performance/reports/employees-20vus.json \
k6 run performance/employees.k6.js

COUNT_P95_MS=3000 \
START_VUS=20 \
TARGET_VUS=20 \
RAMP_DURATION=10s \
HOLD_DURATION=2m \
LOGIN_USERNAME=krennic \
LOGIN_PASSWORD=orson \
K6_REPORT_FILE=performance/reports/employees-20vus-pool10_.html \
K6_JSON_FILE=performance/reports/employees-20vus-pool10_.json \
k6 run performance/employees.k6.js


START_VUS=500 \
TARGET_VUS=500 \
RAMP_DURATION=1m \
HOLD_DURATION=2m \
LOGIN_USERNAME=krennic \
LOGIN_PASSWORD=orson \
K6_REPORT_FILE=performance/reports/employees-50vus-pool20.html \
K6_JSON_FILE=performance/reports/employees-50vus-pool20.json \
k6 run performance/employees.k6.js


START_VUS=50 \
TARGET_VUS=500 \
RAMP_DURATION=5m \
HOLD_DURATION=2m \
LOGIN_USERNAME=krennic \
LOGIN_PASSWORD=orson \
K6_REPORT_FILE=performance/reports/employees-500vus.html \
K6_JSON_FILE=performance/reports/employees-500vus.json \
k6 run performance/employees.k6.js




START_VUS=500 \
TARGET_VUS=1000 \
RAMP_DURATION=5m \
HOLD_DURATION=2m \
LOGIN_USERNAME=krennic \
LOGIN_PASSWORD=orson \
K6_REPORT_FILE=performance/reports/employees-1000vus.html \
K6_JSON_FILE=performance/reports/employees-1000vus.json \
k6 run performance/employees.k6.js



START_VUS=500 \
TARGET_VUS=1000 \
RAMP_DURATION=5m \
HOLD_DURATION=2m \
LOGIN_USERNAME=krennic \
LOGIN_PASSWORD=orson \
K6_REPORT_FILE=performance/reports/employees-1000vus.html \
K6_JSON_FILE=performance/reports/employees-1000vus.json \
k6 run performance/employees.k6.js 2>&1 | tee /tmp/k6-1000.log

run during tests
grep -ic "connection reset by peer" /tmp/k6-1000.log



POOL_DEBUG=true NODE_OPTIONS="--cpu-prof --cpu-prof-dir=/tmp" yarn app 2>&1 | tee /tmp/node-1000.log
Then run your 1000-VU test normally. When Node exits, you'll get a file like:

/tmp/CPU.20260908....cpuprofile
upload to chrome and exported it 
important reading cpuprofile expoted from chrome 
grep -oE '"functionName":"[^"]*"|"hitCount":[0-9]+' CPU-4pm-20260908T155654.cpuprofile | awk 'NR%2==1 {funcName=$0} NR%2==0 {print $0, funcName}' | sort -t: -k2 -nr | head -n 50


grep -oE '"functionName":"[^"]*"|"hitCount":[0-9]+' CPU-4pm-20260908T155654.cpuprofile | awk 'NR%2==1 {funcName=$0} NR%2==0 {print $0, funcName}' | grep -E '(serialize|parseDate|addFields)' | sort -t: -k2 -nr

grep -iE "connection reset by peer|ECONNRESET" /tmp/k6-1200.log | sort | uniq -c

grep -B2 -A2 -i "connection reset by peer" /tmp/k6-1200.log | head -100

ps -p 14445 -o pid,%cpu,%mem,rss

ps -axo pid,%cpu,%mem,rss,command | grep '[n]ode.*app.js'

lsof -nP -p $(pgrep -f 'node.*app.js' | head -1) -a -iTCP:3012



--pm2 
POOL_DEBUG=true NODE_OPTIONS="--cpu-prof --cpu-prof-dir=/tmp" pm2 start ./app/utils/app.js -i 4 --name DomainAgnostic

pm2 stop all
pm2 restart DomainAgnostic

pm2 logs DomainAgnostic --lines 200 | grep -A 20 "COUNT STATS"

Run the resilience test separately:
npx playwright test playwright/tests/employees.resilience.spec.js

Run it with the browser visible:

npx playwright test playwright/tests/employees.resilience.spec.js --headed
Run the concurrency test separately:

npx playwright test playwright/tests/employees.concurrency.spec.js
Configure concurrent users:
EMPLOYEES_CONCURRENCY_USERS=10 \
npx playwright test playwright/tests/employees.concurrency.spec.js 

Configure concurrent users in browser:
EMPLOYEES_CONCURRENCY_USERS=20 \
npx playwright test playwright/tests/employees.concurrency.spec.js --headed

Configure the p95 latency limit:
EMPLOYEES_CONCURRENCY_USERS=10 \
EMPLOYEES_CONCURRENCY_P95_MS=5000 \
npx playwright test playwright/tests/employees.concurrency.spec.js

Run both separately in sequence:
npx playwright test playwright/tests/employees.resilience.spec.js && \
npx playwright test playwright/tests/employees.concurrency.spec.js

# Baseline
EMPLOYEES_CONCURRENCY_USERS=1 \
npx playwright test playwright/tests/employees.concurrency.spec.js

# Normal load
EMPLOYEES_CONCURRENCY_USERS=5 \
npx playwright test playwright/tests/employees.concurrency.spec.js

# Expected peak
EMPLOYEES_CONCURRENCY_USERS=20 \
npx playwright test playwright/tests/employees.concurrency.spec.js

# Stress point
EMPLOYEES_CONCURRENCY_USERS=50 \
npx playwright test playwright/tests/employees.concurrency.spec.js

# Visible debugging run
HEADED=true \
EMPLOYEES_CONCURRENCY_USERS=100 \
npx playwright test playwright/tests/employees.concurrency.spec.js
Use a 10-minute timeout
EMPLOYEES_CONCURRENCY_USERS=100 \
EMPLOYEES_CONCURRENCY_TIMEOUT_MS=600000 \
npx playwright test playwright/tests/employees.concurrency.spec.js

EMPLOYEES_CONCURRENCY_P95_MS=15000 \
EMPLOYEES_CONCURRENCY_USERS=100 \
EMPLOYEES_CONCURRENCY_TIMEOUT_MS=600000 \
npx playwright test playwright/tests/employees.concurrency.spec.js


# Accept up to 10 seconds
EMPLOYEES_CONCURRENCY_P95_MS=10000 \
EMPLOYEES_CONCURRENCY_USERS=1000 \
EMPLOYEES_CONCURRENCY_TIMEOUT_MS=600000 \
npx playwright test playwright/tests/employees.concurrency.spec.js




###########ai based flow generator#######
app/utils/appflowgeneratorAI/commands/business-discovery.sh


node app/utils/appflowgeneratorAI/commands/combine12.js "online groceries store"

tils/appflowgeneratorAI/commands/generateDiagram.js



'correct sequence and updates 
1.customer :(User, UserSession should be part of customer)
2.ProductCatalog: (should be just product , where activity not just Catalog update and management but also customer searchs, browses and select product and its avaialble quantit )
3.ShoppingCart
4.Delivery : (should be not be just delivery selected options also select address from customer(DeliveryLocation) and ask for confirmation, where activity not just delivery but also order tracking and status updates, DeliveryDriver, DeliveryService is part of delivery)
5.Payment:(PaymentProcessor should be part of payment, where activity not just payment processing but also payment confirmation and status updates)
6.Order :
remove OrderItem
remove DeliveryLocation
7.NotificationService
8.Inventory:(after successful deliver of product , system should be able to track inventory levels, update stock quantities, and notify relevant stakeholders in this case supplier/seller when inventory is low or out of stock).
9.Supplier: (should be able to manage supplier information, track supplier performance, and facilitate communication between the system and suppliers for order fulfillment and restocking purposes).   
10.Feedback:(once custoer receives the product, system should prompt for feedback and ratings, allowing customers to provide their opinions and experiences with the product and overall shopping experience).
'


interactiveDiscovery - 3 oct 
correct sequence and update are below
1.Customer 
below are customer's activities not output, till 1.e . 
1.a Customer should be able to register and login in platform. 1.b Customer should be able to search , browse, product/s and its quantity
1.c Customer should be able to add to cart those product or product. 1.c Customer should be able to select Delivery address 1.d customer should be able to select payment option
1.e Customer should be able to receive the order(Order Request) once payment is successfuly
2.remove Order Request
3.Product should be item added, updated by seller/supplier to platform, so that customer can search, browse and purchase Product.  
4.Inventory Item should be inventory , seller can add and update inventory and also system can update inventory once product is ordered by customer
5. remove Order Line Item
6. remove Vendor Order
7. Delivery zone ,Route,Location, DeliveryDriver,Delivery Vehicle,Delivery Staff, Delivery slot ,Delivery Status, Pickup Task, Delivery Route,Delivery History, Delivery Execution should be part of single  Delivery business object's activity not input  
8. Promotion
9.  Transaction should be payment transaction 
10. OrderFullfilment is systemic driven but overriden in case of customer escalation
11. Order History 
12. User Notification 
13. Customer Feedback 
14. Vendor Inventory should be supplier/seller ,who add, updates products in the platform under its activity, Inventory Log should be part of this
 

