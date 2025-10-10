# 🚀 Интеграция комментариев Ethereum ↔ TON

## ✅ Что реализовано

### 1. **Ethereum Smart Contract**
- 📁 `/ethereum/contracts/integrator/CommentIntegrator.sol`
  - ✅ `sendComment()` - отправка комментариев на другие chains
  - ✅ `relayComment()` - получение комментариев от других chains
  - ✅ `encodeCommentVaa()` / `decodeCommentVaa()` - кодирование/декодирование payload

- 📁 `/ethereum/contracts/integrator/interfaces/ICommentReceiver.sol`
  - ✅ Интерфейс для контрактов, принимающих комментарии

### 2. **SDK Updates**
- 📁 `/clients/js/src/vaa.ts`
  - ✅ Добавлен тип `EthComment`
  - ✅ Добавлен тип `TonComment`
  - ✅ Добавлен парсер `ethCommentParser()`
  - ✅ Обновлен `Payload` type

### 3. **CLI Updates**
- 📁 `/clients/js/src/evm.ts`
  - ✅ Добавлена функция `relayCommentToEthereum()`

- 📁 `/clients/js/src/cmds/submit.ts`
  - ✅ Добавлена поддержка `EthComment` payload
  - ✅ Автоматическое распознавание и relay

### 4. **TON Integration** (уже было)
- 📁 `/ton/contracts/tests/integrator.tolk`
  - ✅ `SendComment` - отправка из TON
  - ✅ `RelayComment` - получение в TON

---

## 🎯 Архитектура

```
┌─────────────┐                    ┌─────────────┐
│   Ethereum  │                    │     TON     │
│             │                    │             │
│  Comment    │  ──── VAA ───────> │  Comment    │
│  Integrator │                    │  Integrator │
│             │  <──── VAA ──────  │             │
└─────────────┘                    └─────────────┘
       ↓                                  ↓
   Wormhole                          Wormhole
     Core                              Core
       ↓                                  ↓
   Guardians ←────────────────────────> Guardians
```

### Флоу: Ethereum → TON

1. **Отправка** (Ethereum):
   ```solidity
   CommentIntegrator.sendComment(to, comment, nonce, consistencyLevel)
   ```

2. **Публикация** (Wormhole Core):
   ```solidity
   IWormhole.publishMessage(nonce, payload, consistencyLevel)
   ```
   Payload: `[address to][uint16 length][string comment]`

3. **Подпись** (Guardians):
   - Guardians наблюдают за event `LogMessagePublished`
   - Создают VAA с подписями

4. **Relay** (CLI):
   ```bash
   worm submit <VAA> --chain Ton --network devnet --contract-address <TON_INTEGRATOR>
   ```

5. **Получение** (TON):
   ```tolk
   TON Integrator.RelayComment(encodedVaa)
   ```
   - Вызывает `ParseAndVerifyVM` на Wormhole Core
   - Декодирует `CommentVaa`
   - Отправляет комментарий получателю

### Флоу: TON → Ethereum

1. **Отправка** (TON):
   ```tolk
   TON Integrator.SendComment(to, comment)
   ```

2. **Публикация** (TON Wormhole Core):
   ```tolk
   Wormhole.PublishMessage(payload)
   ```

3. **Подпись** (Guardians)

4. **Relay** (CLI):
   ```bash
   worm submit <VAA> --chain Ethereum --network devnet --contract-address <ETH_INTEGRATOR>
   ```

5. **Получение** (Ethereum):
   ```solidity
   CommentIntegrator.relayComment(encodedVaa)
   ```

---

## 📝 Формат Payload

### Ethereum CommentVaa:
```
Offset | Size | Field
-------|------|-------
0      | 20   | address to (адрес получателя)
20     | 2    | uint16 length (длина комментария)
22     | N    | bytes comment (UTF-8 текст)
```

### TON CommentVaa:
```
Cell:
  - address to (TON MsgAddress)
  - ref -> comment Cell (UTF-8 текст)
```

---

## 🛠️ Инструкции по развертыванию

### Шаг 1: Задеплоить Ethereum контракт

#### Вариант A: С помощью Foundry

```bash
cd /Users/marina/GolandProjects/wormhole/ethereum

# Компиляция
forge build

# Деплой на devnet (Ganache)
forge create contracts/integrator/CommentIntegrator.sol:CommentIntegrator \
  --rpc-url http://localhost:8545 \
  --private-key 0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d \
  --constructor-args 0xC89Ce4735882C9F0f0FE26686c53074E09B0D550

# Запишите адрес контракта!
```

#### Вариант B: С помощью Remix

1. Откройте `/ethereum/contracts/integrator/CommentIntegrator.sol` в Remix
2. Компилируйте с Solidity 0.8.0+
3. Deploy с конструктором:
   - `_wormhole`: `0xC89Ce4735882C9F0f0FE26686c53074E09B0D550` (для devnet)

### Шаг 2: Настроить TON Integrator

TON Integrator уже развернут. Убедитесь, что адрес правильный:

```bash
TON_INTEGRATOR="kQBWynzOaXFc4Hzpv-zoo6JQegzz5GRrolfl8rt59wfXqidk"
```

### Шаг 3: Сохранить адреса

```bash
# Создайте файл с адресами
cat > ~/.wormhole/comment-integrators.env << EOF
ETH_COMMENT_INTEGRATOR="<адрес_из_шага_1>"
TON_COMMENT_INTEGRATOR="kQBWynzOaXFc4Hzpv-zoo6JQegzz5GRrolfl8rt59wfXqidk"
EOF

source ~/.wormhole/comment-integrators.env
```

---

## 🧪 Тестирование

### Тест 1: Ethereum → TON

```bash
# 1. Отправить комментарий из Ethereum
cast send $ETH_COMMENT_INTEGRATOR \
  "sendComment(address,string,uint32,uint8)" \
  "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0" \
  "Hello TON from Ethereum!" \
  0 \
  15 \
  --rpc-url http://localhost:8545 \
  --private-key 0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d \
  --value 0.01ether

# 2. Дождаться VAA от guardians (обычно ~5 секунд в devnet)

# 3. Получить VAA (например, через API или spy)
VAA=$(curl -s http://localhost:7071/v1/signed_vaa/2/000000000000000000000000${ETH_COMMENT_INTEGRATOR}/1 | jq -r '.vaaBytes')

# 4. Отправить на TON
worm submit $VAA \
  --chain Ton \
  --network devnet \
  --contract-address $TON_COMMENT_INTEGRATOR

# 5. Проверить в TON explorer
```

### Тест 2: TON → Ethereum

```bash
# 1. Вызвать SendComment в TON Integrator
# (используйте TON SDK или ton-cli)

# 2. Получить VAA
VAA=$(curl -s "http://localhost:7071/v1/signed_vaa/62/${TON_COMMENT_INTEGRATOR}/1" | jq -r '.vaaBytes')

# 3. Отправить на Ethereum
worm submit $VAA \
  --chain Ethereum \
  --network devnet \
  --contract-address $ETH_COMMENT_INTEGRATOR

# 4. Проверить event CommentReceived
cast logs --address $ETH_COMMENT_INTEGRATOR \
  --rpc-url http://localhost:8545 \
  "CommentReceived(uint16,bytes32,address,string)"
```

---

## 📊 Проверка работы

### Просмотр событий Ethereum

```javascript
const ethers = require('ethers');

const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
const integrator = new ethers.Contract(
    process.env.ETH_COMMENT_INTEGRATOR,
    [
        'event CommentSent(address indexed sender, address indexed to, string comment, uint64 sequence)',
        'event CommentReceived(uint16 indexed fromChain, bytes32 indexed fromAddress, address indexed to, string comment)'
    ],
    provider
);

// Слушать отправку
integrator.on('CommentSent', (sender, to, comment, sequence) => {
    console.log(`📤 Sent: ${sender} -> ${to}: "${comment}" (seq: ${sequence})`);
});

// Слушать получение
integrator.on('CommentReceived', (fromChain, fromAddress, to, comment) => {
    console.log(`📥 Received from chain ${fromChain}: "${comment}"`);
});
```

### Парсинг VAA

```bash
# Распарсить VAA чтобы увидеть payload
worm parse <VAA>
```

---

## 🚨 Troubleshooting

### Проблема: VAA не проходит верификацию

**Решение:**
```bash
# Проверьте guardian set
cast call $WORMHOLE_CORE \
  "getCurrentGuardianSetIndex()" \
  --rpc-url http://localhost:8545

# Убедитесь, что guardians активны
docker ps | grep guardiand
```

### Проблема: "Contract address required for EthComment relay"

**Решение:**
```bash
# Всегда указывайте --contract-address для relay
worm submit <VAA> \
  --chain Ethereum \
  --network devnet \
  --contract-address $ETH_COMMENT_INTEGRATOR
```

### Проблема: Транзакция fails с "invalid emitter"

**Решение:**
- Убедитесь, что VAA действительно от зарегистрированного emitter
- Проверьте, что используете правильный Wormhole Core address

---

## 🎓 Примеры интеграции

### Пример 1: Простая отправка из JavaScript

```javascript
async function sendCommentToTON(recipientTonAddress, message) {
    const { ethers } = require('ethers');
    
    const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    const integrator = new ethers.Contract(
        process.env.ETH_COMMENT_INTEGRATOR,
        ['function sendComment(address,string,uint32,uint8) payable returns (uint64)'],
        wallet
    );
    
    const messageFee = await integrator.getMessageFee();
    
    const tx = await integrator.sendComment(
        recipientTonAddress,
        message,
        0,    // nonce
        15,   // consistencyLevel
        { value: messageFee }
    );
    
    const receipt = await tx.wait();
    console.log(`Comment sent! Tx: ${receipt.transactionHash}`);
    
    return receipt;
}
```

### Пример 2: Автоматический relay

```javascript
// Слушать события и автоматически relay на TON
integrator.on('CommentSent', async (sender, to, comment, sequence) => {
    console.log(`New comment to relay: ${comment}`);
    
    // Дождаться VAA
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Получить VAA
    const vaa = await getVAAFromSpy(sequence);
    
    // Relay на TON
    await exec(`worm submit ${vaa} --chain Ton --network devnet --contract-address ${TON_INTEGRATOR}`);
});
```

---

## 📚 Полезные команды

```bash
# Проверить balance для fees
cast balance <address> --rpc-url http://localhost:8545

# Проверить message fee
cast call $ETH_COMMENT_INTEGRATOR "getMessageFee()" --rpc-url http://localhost:8545

# Отправить тестовый комментарий
cast send $ETH_COMMENT_INTEGRATOR \
  "sendComment(address,string,uint32,uint8)" \
  <recipient> "Test message" 0 15 \
  --value 0.01ether \
  --rpc-url http://localhost:8545 \
  --private-key $PRIVATE_KEY

# Просмотреть logs
cast logs --address $ETH_COMMENT_INTEGRATOR --rpc-url http://localhost:8545
```

---

## ✅ Чеклист готовности

- [x] Ethereum контракт `CommentIntegrator.sol` создан
- [x] SDK обновлен с типами `EthComment` и `TonComment`
- [x] CLI поддерживает relay `EthComment`
- [x] TON Integrator уже поддерживает комментарии
- [x] Документация создана
- [ ] **TODO: Задеплоить Ethereum контракт**
- [ ] **TODO: Протестировать Ethereum → TON**
- [ ] **TODO: Протестировать TON → Ethereum**

---

## 🎯 Следующие шаги

1. **Деплой контракта**:
   ```bash
   cd /Users/marina/GolandProjects/wormhole/ethereum
   forge create contracts/integrator/CommentIntegrator.sol:CommentIntegrator \
     --rpc-url http://localhost:8545 \
     --private-key 0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d \
     --constructor-args 0xC89Ce4735882C9F0f0FE26686c53074E09B0D550
   ```

2. **Тестирование**:
   - Отправить комментарий из Ethereum
   - Получить VAA
   - Relay на TON
   - Проверить доставку

3. **Обратный тест**:
   - Отправить из TON
   - Relay на Ethereum
   - Проверить event

---

**Готово к использованию! 🚀**



