### Група: ІТ-91

### Боринець Олександра Ігорівна

### Бурла Віталій Ігорович

### Ткаченко Віктор Віталійович

### Хільчук Олена Валеріївна

# Лабораторна робота №1.

### Тема: Розгортання додатку в середовищі _Kubernetes._

### Завдання:

1. Створити кластер _Kubernetes_.
2. Реалізувати кілька сервісів (мінімум 2 сервіси або сервіс та клієнт). Описати для них _Dockerfile_.
3. Розгорнути сервіси в середовищі _Kubernetes_.
4. Реалізувати доступ до сервісів за допомогою _Ingress_.

### Допоміжні матеріали

### 1. Створення кластеру _Kubernetes_ (або скорочено _k8s_)

Для створення кластеру _Kubernetes_ потрібно встановити:

1. [Minikube](https://kubernetes.io/uk/docs/tasks/tools/install-minikube/) - інструмент який дозволяє запустити _Kubernetes_ кластер з одного вузла локально на віртуальній машині.

> При роботі з _minikube_ не використовуйте драйвер _docker_, з ним не коректно працює _ingress_.  
> Перевірені драйвера: для _MacOS_ - _virtualbox_, для _Windows_ - _hyper-v_, для _Ubuntu_ - _kvm_

> Альтернативно можна налаштувати кластер _kubernetes_ за допомогою хмарних провайдерів (_Amazon AWS_, _Google Cloud_, _Microsoft Azure_).  
> В методичці будуть використовуватись приклади з _minikube_

2. [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/) - інтерфейс командного рядка, для роботи з _Kubernetes_

### 2.1 Реалізація сервісу в _Docker_

> Очікується, що до цього курсу всі студенти знайомі з _Docker_ та вміють написати простий _Dockerfile_.
> Тому тут описано лише один важливий момент при створенні _Dockerfile_.  
> Якщо хтось стикається з _Docker_ вперше, дайте знати, додам більше інформації.

Для прикладу будемо використовувати простий сервіс написаний на [golang](https://golang.org/).

Сервіс запускає `http` сервер з однією точкою входу `/api/service2`, що повертає повідомлення `hello`.

```go
package main

import (
	"fmt"
	"net/http"
)

func main() {
	http.HandleFunc("/api/service2", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "hello")
	})

	http.ListenAndServe(":8080", nil)
}
```

Найпростіший _Dockerfile_ для сервісу буде виглядати наступним чином.

```Dockerfile
FROM golang:1.15 AS server_builder
EXPOSE 8080
COPY services/service2 .
CMD ["go", "run", "main.go"]
```

При використанні такого _Dockerfile_, хоч програма складається всього з кількох рядків, образ займає 839MB.  
Перевіримо вивід команди `docker image ls`

```log
REPOSITORY      TAG      IMAGE ID       CREATED          SIZE
service2        latest   ae2e7324488e   28 seconds ago   839MB
```

Для того, щоб мінімізувати вихідний образ потрібно розбити _Dockerfile_ на дві частини:

1. В першій частині буде відбувається збирання нашого сервісу.
   Ця частина вимагає додаткових залежностей (в даному прикладі це лише _golang_),
   але тут також має виконуватись завантаження всіх необхідних бібліотек для нашого сервісу, сторонніх додатків необхідних для збирання.

2. Друга частина має лише запускати файл, який отримали в результаті збирання.
   Більшість залежностей, які використовуються для збирання, для запуску не потрібні, це дозволяє значно зменшити об'єм образу.
   У випаду _golang_ в результаті збирання створюється бінарний файл, який можна запустити без будь-яких залежностей.
   У випадку, наприклад, з сервером на _JavaScript_ мінімальний образ має містити втановлений _nodejs_ для запуску серверу.

```Dockerfile
#1. build binary
FROM golang:1.15 AS server_builder

WORKDIR /
COPY services/service2/main.go .
RUN go build -ldflags "-w -s -linkmode external -extldflags -static" -a main.go

#2. start server
FROM scratch

EXPOSE 8080
COPY --from=server_builder /main .
CMD ["./main"]
```

> В залежності від складності сервісу, _Dockerfile_ може бути розділений і на більшу кількість частин, де, наприклад, можуть компілюватись сторонні залежності.

Тепер у виводі `docker image ls` можна побачити, що _golang_, початковий образ, що використовується для збирання займає 839MB,
тоді як кінцевий образ, який власне потім розгортається, всього 5.43MB

```log
service2        latest      f32f76364223   About a minute ago   5.43MB
<none>          <none>      9b8e3bf746ea   About a minute ago   882MB
<none>          <none>      1588ab6b7f84   3 minutes ago        839MB
golang          1.15        eba5d0436b0b   2 days ago           839MB
```

### 2.2 Реалізація клієнта в _Docker_

В директорії `lab1_k8s/client` знаходиться базовий приклад клієнта створений командою `npx create-react-app client`

Так само, як і в прикладі з сервером, _Dockerfile_ для клієнта має бути розбитий на дві частини:

```Dockerfile
#build
FROM node:14.15-alpine as build
WORKDIR /app
COPY client/package.json ./
COPY client/package-lock.json ./
RUN npm install
COPY client/. ./
RUN npm run build

#run
FROM nginx:stable-alpine
COPY --from=build /app/build /usr/share/nginx/html
# COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

1. В першій частині виконується збирання проекту. Для цього необхідно використати образ `node`, також встановити всі залежності та зібрати проект.
2. Клієнт не виконує ніякої серверної роботи, а просто роздає статичні файли (js, html, css, ...)
   тому як сервер ми можемо використати `nginx` і просто скопіювати, отримані на етапі збирання, файли в директорію `/usr/share/nginx/html`.
   Це коренева директорія `nginx` з якої будуть роздаватись файли.

> За замовчуванням `nginx` буде використовувати свій стандартний файл конфігурацій.
> Якщо його потрібно налаштувати, можна в директорії з клієнтським кодом створити файл `/client/nginx/nginx.conf`
> та задати налаштування, які необхідні для вашого додатку. І розкоментувати строку в Dockerfile `COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf`

З директорії `k8s_lab1` створимо кентейнер

`docker build -t client:0.1 -f client/Dockerfile .`

тепер запустивши контейнер, можна побачити стартову сторінку _React_

`docker run -p 8080:80 -t client:0.1`

> Якщо до цього було запущено `eval $(minikube docker-env)` контейнер буде запущено в `minikube`.
> Тоді звернутись до нього можна через `echo $(minikube ip):8080`
> Щоб запустити контейнер локально потрібно змінити контекст _Docker_ назад на локальну машину `eval $(minikube docker-env --unset)`
> Тепер потрібно перезібрати контейнер і після запуску він буде доступний локально `localhost:8080`

### 3.1 Розгортання додатку. Створення компонент _Pod_ та _Deployment_

**_Pod_** - це група з одного або декількох контейнерів із загальним сховищем та мережевими ресурсами та специфікацією запуску контейнерів.
Для розгортання додатку в кластері _k8s_ потрібно створити _Pod_ з контейнером, що міститиме ваш сервіс.

> Для даної демонстрації буде використовуватись образ з сервером `nginx`.

Для створення поди потрібно задати 2 обов'язкові параметри ім'я `nginx-pod` та образ `nginx:alpine`:

```
kubectl run nginx-pod --image=nginx:alpine
```

Перевірити наявні _Pod_ можна виконавши наступну команду:

```shell
kubectl get pods
```

Вивід має виглядати наступним чином:

```log
NAME           READY   STATUS    RESTARTS   AGE
nginx-pod      1/1     Running   0          2s
```

Хоча _Kubernetes_ дозволяє працювати з _Pod_ напряму, в такому випадку _Pod_ не буде контролюватись оркестратором _Kubernetes_.
_Pod_ не буде перестворюватись у випадку відмови, та її не можна буде масштабувати. Для цього потрібно створити _Deployment_.

Перед тим як продовжити, видалимо створену _Pod_

```
kubectl delete pod nginx-pod
```

**_Deployment_** - це конфігурація _Kubernetes_, що дозволяє описувати бажаний стан системи і являє собою набір з декількох однакових _Pod_ без унікальних ідентифікаційних даних.
На основі конфігурації _Deployment_, _Deployment Controller_ запускає задану кількість реплік вашої програми та автоматично замінює будь-які екземпляри, які не працюють або не реагують.
Таким чином, _Deployment_ допомагає забезпечити доступність одного або декількох екземплярів вашої програми.

Створити _Deployment_ можна наступною командою:

```shell
kubectl create deployment nginx --image=nginx:alpine
```

Результат `kubectl get deployments` має виглядати наступним чином:

```log
NAME    READY   UP-TO-DATE   AVAILABLE   AGE
nginx   1/1     1            1           5s
```

Результат `kubectl get pods`:

```log
NAME                      READY   STATUS    RESTARTS   AGE
nginx-565785f75c-k5tmz    1/1     Running   0          2m19s
```

Після того як створено _Deployment_, його _Pod_ будуть доступні в середині кластера _k8s_, але ззовні до них немає доступу.
Для того, щоб можна було отримати доступ до створених _Pod_, потрібно створити проксі,
який перенаправлятиме запити ззовні в приватну мережу _kubernetes_.

```shell
kubectl proxy
```

> Проксі запускається на `8001` порту, переконайтесь, що він не зайнятий іншим процесом

При запуску проксі _kubernetes_ автоматично створює точки входу для кожного _Pod_ на основі його імені.
Для того, щоб отримати ім'я _Pod_ можемо подивитись список _Pod_, як було показано вище,
або за допомогою наступної команди, одразу збережемо ім'я поди в змінну середовища:

```shell
export POD_NAME=$(kubectl get pods -o go-template --template '{{range .items}}{{.metadata.name}}{{"\n"}}{{end}}')
```

Звернутись до запущеної поди з командного рядка можна за допомогою `curl`:

```shell
curl http://localhost:8001/api/v1/namespaces/default/pods/$POD_NAME/proxy/
```

Або відкрити у браузері

```shell
http://localhost:8001/api/v1/namespaces/default/pods/nginx-565785f75c-k5tmz/proxy/
```

При роботі з _Pod_ можна використовувати наступні команди, для перевірки роботи

- Для виводу логів: `kubectl logs $POD_NAME`
- Для виконання команди в контейнері (наприклад переглянути змінні середовища): `kubectl exec $POD_NAME -- env`

> Дані команди працюватимуть, якщо в _Pod_ запущений один контейнер

### 3.2 Розгортання додатку. Створення _Service_

_Pod_ не надійний елемент в _Kubernetes_ вони можуть вмирати, і після цього вони ніколи не відновлюються,
на їх місце будуть створені нові _Pod_, щоб забезпечити стабільну роботу додатку, але доступ до них буде змінено, _IP_ адреси будуть інші.

**Service** у _Kubernetes_ - це абстракція, що об'єднує логічний набір _Pod_ і забезпечує доступ до них
Набір _Pod_, призначених для _Service_, зазвичай визначається через [`selector`](k8s/service1/service1-service.yaml#L10).

Для того, щоб створити _Service_ потрібно виконати наступну команду:

```shell
kubectl expose deployment/nginx --type="NodePort" --port 8080
```

```shell
kubectl get services

NAME         TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)          AGE
kubernetes   ClusterIP   10.96.0.1      <none>        443/TCP          8d
nginx        NodePort    10.96.118.59   <none>        8080:32689/TCP   150m
```

Тепер, до запущеного додатку можна звернутись через _NodePort_, який, в даному випадку - `32689`

```shell
export NODE_PORT=$(kubectl get services/nginx -o go-template='{{(index .spec.ports 0).nodePort}}')
```

Виконавши цю команду, отримаємо початкову сторінку _nginx_

```shell
curl $(minikube ip):$NODE_PORT
```

Також варто звернути увагу, що всі сутності, які ми створили об'єднані однаковими мітками.
Перевірити це можна виконавши наступні команди:

```
kubectl get deployments --show-labels
kubectl get pods --show-labels
kubectl get services --show-labels
```

Перед тим як продовжити, потрібно очистити створені сутності.
Якщо видалити запущену _Pod_, _Deployment Controller_ запустить на її місце іншу.
Тому для очищення ресурсів потрібно видалити _Deployment_

```
kubectl delete deployment nginx
```

Видалення сервісу відбувається аналогічно до інших сутностей

```
kubectl delete service nginx
```

### 3.3 Розгортання додатку. Створення сутностей за допомогою файлів конфігурацій

До цього для створення компонент в _k8s_ ми використовували командний рядок.
Такий підхід добре підходить для демонстрацій, але в рельний проектах практично не використовується.

Кожна конфігурація має містити наступні поля:

- `apiVersion` - версія _Kubernetes API_ для створення об'єкту (для кожного об'єту ця версія може бути різною)
- `kind` - Тип сутності (_Deployment_, _Service_, _Ingress_, ...)
- `metadata` - Допомагає ідентифікувати екземпляр об'єкту, включає такі поля, як `name`, `UID`, та `namespace`
- `spec` - Описує стан об'єкту, унікальний для кожного типу сутності

В директорії `k8s` міститься мінімальний набір конфігурацій для розгортання застосунку.
Демонстраційний додаток складається з 2-х примітивних сервісів, що мають одну точку входу по якій повертають повідомлення.
Кожен сервіс має містити 2 файли конфігурацій

1. `deployment.yaml` - для створення _Deployment_ та _Pod_
2. `service.yanl` - для створення _Service_

Для того, щоб розгорнути `service1` потрібно виконати наступне:

1. Створити образ _Docker_ для додатку `service1`

> При роботі з локальними образами, перед створенням образу потрібно виконати
> `eval $(minikube docker-env)`, цю команду потрібно запускати в кожному вікні терміналу
> В налаштуванні вказати `imagePullPolicy: Never`, щоб _k8s_ не намагався завантажити образ

```
docker build -t service1:0.1 -f services/service1/Dockerfile .
```

2. Розгорнути _Deployment_

```
kubectl apply -f k8s/service1/service1-deployment.yaml
```

> При першому запуску можна використовувати
> `kubectl create -f k8s/service1/service1-deployment.yaml`, яка так само створить _Deployment_
> Але ця команда видасть помилку, якщо _Deployment_ вже створено,
> тоді як `apply` створить Deployment, якщо його немає, або оновить, якщо він існує.

3. Додати _Service_

```
kubectl apply -f k8s/service1/service1-service.yaml
```

> Команди в _Kubernetes_ можна запускати не лише на рівні файлів, а й на рівні директорій.
> `kubectl apply -f k8s/service1` застосує конфігурації з двох файлів `service1-deployment.yaml` та `service1-service.yaml`

Щоб перевірити, що все працює можна створити проксі

```shell
kubectl proxy
```

Та зробити запит на наступний _URL_

```shell
curl http://localhost:8001/api/v1/namespaces/default/services/service1-service/proxy/api/service1
```

Аналогічно можна запустити `service2` та клієнт

##### 4. Налаштування доступу до додатку за допомогою _Ingress_

На даний момент, має бути запущено 2 сервіси, що доступні по адресах (з увімкненим проксі):

```shell
http://localhost:8001/api/v1/namespaces/default/services/service1-service/proxy/api/service1
http://localhost:8001/api/v1/namespaces/default/services/service2-service/proxy/api/service2
```

Для реальних додатків використовувати `kubectl proxy` не можна, оскільки це відкриває доступ до внутрішньої мережі, і створить проблеми з безпекою.

Є 3 варіанти, як можна відкрити доступ до додатку без використання проксі

1. Змінити тип _Service_ з _ClusterIp_ на _NodePort_. Та застосувати зміни за допомогою команди `kubectl apply -f k8s/service1/`
   Тепер сервіси будуть доступні ззовні кластеру _k8s_ за адресами:

```shell
curl $(minikube ip):$NODE_PORT
```

Цей підхід має ряд проблем, через які також не використовується в реальному середовищі:

- Можна запустити лише один сервіс на одному порту
- Порт можна вибрати лише в рамках 30000–32767
- Якщо _IP_ адреса вузла чи віртуальної машини змінилась, це потрібно якось обробити

> Детальніше можна почитати [тут](https://medium.com/google-cloud/kubernetes-nodeport-vs-loadbalancer-vs-ingress-when-should-i-use-what-922f010849e0)

2. Використати тип сервісу _LoadBalancer_ цей тип доступний лише для хмарних провайдерів,
   і деталі реалізації також залежать від провайдера. Цей тип не буде розглядатись в даному курсі
3. Використати _Ingress_

**Ingress** - це об'єкт _API_, що контролює зовнішній доступ до сервісів в кластері _k8s_, як правило через _HTTP_.

> Перед використанням, потрібно увімкнути розширення для _minikube_ `minikube addons enable ingress`

Проста конфігурація _Ingress_ знаходиться у файлі `k8s/ingress.yaml`

Застосувати її можна аналогічно до інших конфігурацій

```shell
kubectl apply -f k8s/ingress.yaml
```

Тепер сервіси знаходяться на одному фіксованому порту,
і для зовнішніх клієнтів виглядають як один додаток, а не різні його частини

```
curl $(minikube ip)/api/service1
curl $(minikube ip)/api/service2
```

Клієнт можна відкрити в браузері за адресою `$(minikube ip)`

##### Додатково

На сайті kubernetes є хороший [інтерактивний курс](https://kubernetes.io/uk/docs/tutorials/kubernetes-basics/deploy-app/deploy-interactive/)
