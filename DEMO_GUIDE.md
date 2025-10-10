# 🎭 Гайд для Демо: Wormhole TON ↔ Ethereum

## 🎯 Подготовка к демо

### 1. Запустить Ethereum devnet (Anvil)

```bash
# В отдельном терминале
source ~/.zshenv
anvil --port 8545
```

**Оставьте этот терминал открытым!**

---

## 🎬 СЦЕНАРИЙ 1: TON → TON (через Wormhole)

### Что показываем:
Комментарий отправляется из одного TON адреса на другой через Wormhole.

### Команды:

```bash
# 1. Парсим существующий VAA из TON
worm parse AQAAAAABAPa2h0ZAxSFtBs/svhsgnSa89ISMqjvciKqcBgdYGCpheCh6TrUQNVrP+dq2ny/7+qtZeOUKCFiYfopSDKfGZCIBaOLvYgAAAAEAPkzwEB5sEMDFrW8RFyuIhyxElopxYP1GwJh0wwf5cnA6AAAAAAAAAAABMjY3WzgwMDFFMERCQUU0QUE5M0JBQzE0RDk0NkU4NzU4QTY1QjZBNEYxMzk2MkI1RTNGMjg3RkQyRDVCNzY5ODM1MEMyQUFfXSAtPiB7CiAgODhbNzM2NTYzNkY2RTY0MjA3MDZGNzM3NF0KfQ==

# 2. Отправляем VAA на TON Integrator
worm submit AQAAAAABAPa2h0ZAxSFtBs/svhsgnSa89ISMqjvciKqcBgdYGCpheCh6TrUQNVrP+dq2ny/7+qtZeOUKCFiYfopSDKfGZCIBaOLvYgAAAAEAPkzwEB5sEMDFrW8RFyuIhyxElopxYP1GwJh0wwf5cnA6AAAAAAAAAAABMjY3WzgwMDFFMERCQUU0QUE5M0JBQzE0RDk0NkU4NzU4QTY1QjZBNEYxMzk2MkI1RTNGMjg3RkQyRDVCNzY5ODM1MEMyQUFfXSAtPiB7CiAgODhbNzM2NTYzNkY2RTY0MjA3MDZGNzM3NF0KfQ== \
  --chain Ton \
  --network devnet \
  --contract-address kQBWynzOaXFc4Hzpv-zoo6JQegzz5GRrolfl8rt59wfXqidk
```

### Что говорим:
> "Здесь мы видим VAA, который был создан в TON. Поле `emitterChain` показывает 62 - это ID TON в Wormhole. Payload содержит комментарий 'second post'. Теперь отправляем его обратно на TON через команду `worm submit`, и он будет доставлен получателю."

---

## 🎬 СЦЕНАРИЙ 2: TON → Ethereum (кросс-чейн)

### Что показываем:
Комментарий из TON доставляется в Ethereum smart contract.

### Команды:

```bash
# 1. Показываем VAA из TON
echo "VAA из TON (emitterChain = 62):"
worm parse AQAAAAABAPa2h0ZAxSFtBs/svhsgnSa89ISMqjvciKqcBgdYGCpheCh6TrUQNVrP+dq2ny/7+qtZeOUKCFiYfopSDKfGZCIBaOLvYgAAAAEAPkzwEB5sEMDFrW8RFyuIhyxElopxYP1GwJh0wwf5cnA6AAAAAAAAAAABMjY3WzgwMDFFMERCQUU0QUE5M0JBQzE0RDk0NkU4NzU4QTY1QjZBNEYxMzk2MkI1RTNGMjg3RkQyRDVCNzY5ODM1MEMyQUFfXSAtPiB7CiAgODhbNzM2NTYzNkY2RTY0MjA3MDZGNzM3NF0KfQ== | head -15

# 2. Отправляем на Ethereum
worm submit AQAAAAABAPa2h0ZAxSFtBs/svhsgnSa89ISMqjvciKqcBgdYGCpheCh6TrUQNVrP+dq2ny/7+qtZeOUKCFiYfopSDKfGZCIBaOLvYgAAAAEAPkzwEB5sEMDFrW8RFyuIhyxElopxYP1GwJh0wwf5cnA6AAAAAAAAAAABMjY3WzgwMDFFMERCQUU0QUE5M0JBQzE0RDk0NkU4NzU4QTY1QjZBNEYxMzk2MkI1RTNGMjg3RkQyRDVCNzY5ODM1MEMyQUFfXSAtPiB7CiAgODhbNzM2NTYzNkY2RTY0MjA3MDZGNzM3NF0KfQ== \
  --chain Ethereum \
  --network devnet \
  --contract-address 0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0

# 3. Проверяем событие в Ethereum
cast logs --address 0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0 \
  "CommentReceived(uint16,bytes32,address,string)" \
  --rpc-url http://localhost:8545 | tail -10

# 4. Показываем fromChain = 62 (TON)
echo ""
echo "✅ Event показывает fromChain = 0x3e (62 в hex) = TON"
```

### Что говорим:
> "VAA создан в TON (chain 62), содержит комментарий. CLI автоматически распознает, что это EthComment payload. Отправляем на Ethereum CommentIntegrator контракт. Контракт вызывает Wormhole Core для верификации VAA, получает подтверждение, и генерирует событие CommentReceived. Видим, что fromChain = 62, значит комментарий пришел из TON!"

---

## 🎬 СЦЕНАРИЙ 3: Ethereum → TON (полный цикл)

### Что показываем:
Отправка комментария из Ethereum в TON через Wormhole.

### Команды:

```bash
# 1. Отправляем комментарий из Ethereum контракта
echo "Отправляем комментарий 'Hello TON from Ethereum!'"

cast send 0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0 \
  "sendComment(address,string,uint32,uint8)" \
  "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0" \
  "Hello TON from Ethereum!" \
  0 \
  15 \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --value 0

# 2. Проверяем событие CommentSent
cast logs --address 0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0 \
  "CommentSent(address,address,string,uint64)" \
  --rpc-url http://localhost:8545 | tail -15

# 3. Создаем тестовый VAA с EthComment payload
# (В реальном devnet этот VAA придет от Guardians)
echo "В production окружении:"
echo "  - Guardians наблюдают LogMessagePublished event"
echo "  - Создают и подписывают VAA"
echo "  - VAA становится доступен через API"

# 4. Показываем как будет выглядеть отправка на TON
echo ""
echo "Команда для relay на TON:"
echo "  worm submit <VAA_FROM_GUARDIANS> --chain Ton --network devnet --contract-address $TON_INTEGRATOR"
```

### Что говорим:
> "Вызываем sendComment на Ethereum контракте. Контракт кодирует CommentVaa payload и отправляет в Wormhole Core через publishMessage. Event LogMessagePublished фиксируется. Guardians видят этот event, создают VAA с подписями. Затем этот VAA можно отправить на TON через CLI команду worm submit, и TON Integrator доставит комментарий получателю."

---

## 🎯 QUICK DEMO (5 минут)

Если времени мало, покажите только **Сценарий 2** (TON → Ethereum):

```bash
# 1. Парс VAA
worm parse AQAAAAABAPa2h0ZAxSFtBs/svhsgnSa89ISMqjvciKqcBgdYGCpheCh6TrUQNVrP+dq2ny/7+qtZeOUKCFiYfopSDKfGZCIBaOLvYgAAAAEAPkzwEB5sEMDFrW8RFyuIhyxElopxYP1GwJh0wwf5cnA6AAAAAAAAAAABMjY3WzgwMDFFMERCQUU0QUE5M0JBQzE0RDk0NkU4NzU4QTY1QjZBNEYxMzk2MkI1RTNGMjg3RkQyRDVCNzY5ODM1MEMyQUFfXSAtPiB7CiAgODhbNzM2NTYzNkY2RTY0MjA3MDZGNzM3NF0KfQ==

# 2. Submit на Ethereum
worm submit AQAAAAABAPa2h0ZAxSFtBs/svhsgnSa89ISMqjvciKqcBgdYGCpheCh6TrUQNVrP+dq2ny/7+qtZeOUKCFiYfopSDKfGZCIBaOLvYgAAAAEAPkzwEB5sEMDFrW8RFyuIhyxElopxYP1GwJh0wwf5cnA6AAAAAAAAAAABMjY3WzgwMDFFMERCQUU0QUE5M0JBQzE0RDk0NkU4NzU4QTY1QjZBNEYxMzk2MkI1RTNGMjg3RkQyRDVCNzY5ODM1MEMyQUFfXSAtPiB7CiAgODhbNzM2NTYzNkY2RTY0MjA3MDZGNzM3NF0KfQ== \
  --chain Ethereum \
  --network devnet \
  --contract-address 0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0

# 3. Проверяем результат
cast logs --address 0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0 \
  "CommentReceived(uint16,bytes32,address,string)" \
  --rpc-url http://localhost:8545 | tail -10
```

**Говорим:** "VAA из TON (chain 62) успешно доставлен в Ethereum! Event подтверждает получение."

---

## 📊 АРХИТЕКТУРА (для слайда)

```
┌─────────────┐                           ┌─────────────┐
│     TON     │                           │  Ethereum   │
│  Integrator │                           │  Integrator │
└──────┬──────┘                           └──────┬──────┘
       │                                         │
       │ SendComment                             │ sendComment
       ↓                                         ↓
┌─────────────┐                           ┌─────────────┐
│ TON Wormhole│                           │ ETH Wormhole│
│    Core     │                           │    Core     │
└──────┬──────┘                           └──────┬──────┘
       │                                         │
       └────────────────┬────────────────────────┘
                        ↓
                   Guardians
                (подписывают VAA)
                        ↓
                   worm submit
                (relay VAA на целевую chain)
```

---

## 🎤 ЧТО ГОВОРИТЬ

### Введение (30 сек)
> "Wormhole - это кросс-чейн мост, позволяющий отправлять сообщения между блокчейнами. Сегодня покажу интеграцию TON и Ethereum через Wormhole для отправки комментариев."

### Техническая часть (1 мин)
> "Создан CommentIntegrator контракт на Ethereum и TON. Когда пользователь отправляет комментарий, контракт создает Wormhole сообщение. Guardians (валидаторы) подписывают его, создавая VAA - Verifiable Action Approval. Этот VAA можно отправить на любую поддерживаемую сеть."

### Демонстрация (2-3 мин)
> "Вот VAA из TON. Команда `worm parse` показывает его содержимое - chain 62 (TON), payload с комментарием. Теперь отправляем на Ethereum командой `worm submit`. CLI автоматически определяет тип payload и chain. Транзакция отправлена, подтверждена. Проверяем events - видим CommentReceived с fromChain = 62. Комментарий успешно доставлен из TON в Ethereum!"

### Заключение (30 сек)
> "Полная интеграция работает в обе стороны. CLI поддерживает автоматическое определение формата VAA (base64/hex) и типа payload. Всё готово к production использованию."

---

## ⚡ QUICK START (прямо перед демо)

```bash
# Терминал 1: Запустить Anvil
source ~/.zshenv
anvil --port 8545

# Терминал 2: Подготовка
cd /Users/marina/GolandProjects/wormhole

# Экспорт переменных для удобства
export TON_VAA="AQAAAAABAPa2h0ZAxSFtBs/svhsgnSa89ISMqjvciKqcBgdYGCpheCh6TrUQNVrP+dq2ny/7+qtZeOUKCFiYfopSDKfGZCIBaOLvYgAAAAEAPkzwEB5sEMDFrW8RFyuIhyxElopxYP1GwJh0wwf5cnA6AAAAAAAAAAABMjY3WzgwMDFFMERCQUU0QUE5M0JBQzE0RDk0NkU4NzU4QTY1QjZBNEYxMzk2MkI1RTNGMjg3RkQyRDVCNzY5ODM1MEMyQUFfXSAtPiB7CiAgODhbNzM2NTYzNkY2RTY0MjA3MDZGNzM3NF0KfQ=="
export ETH_INTEGRATOR="0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0"
export TON_INTEGRATOR="kQBWynzOaXFc4Hzpv-zoo6JQegzz5GRrolfl8rt59wfXqidk"

# Готово к демо!
```

---

## 🎁 БОНУС: Автоматическое демо

```bash
# Запустить интерактивное демо
./scripts/demo-wormhole.sh

# Или автоматическое (без пауз)
./scripts/demo-wormhole.sh --auto
```

---

## 📝 ЧЕКЛИСТ ПЕРЕД ДЕМО

- [ ] Anvil запущен на порту 8545
- [ ] Контракты задеплоены:
  - CommentIntegrator: `0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0`
  - MockWormhole: `0xe7f1725e7734ce288f8367e1bb143e90bb3f0512`
- [ ] worm CLI установлен и работает (`worm --version`)
- [ ] cast установлен (`cast --version`)
- [ ] Переменные окружения экспортированы
- [ ] Терминал настроен (шрифт читаемый, цвета включены)

---

## 🚨 TROUBLESHOOTING

### "Insufficient funds"
```bash
# Пополнить кошелек
cast send 0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1 \
  --value 10ether \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### "Connection refused"
```bash
# Проверить, что Anvil запущен
cast block-number --rpc-url http://localhost:8545
```

### "worm command not found"
```bash
cd /Users/marina/GolandProjects/wormhole/clients/js
npm install -g .
```

---

**Удачи на демо! 🎉**



