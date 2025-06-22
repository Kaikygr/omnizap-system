# OmniZap v1.0.4

Sistema profissional de automação WhatsApp com tecnologia Baileys e arquitetura modular avançada

## 📋 Descrição

OmniZap é um sistema robusto e profissional para automação de mensagens WhatsApp, desenvolvido com a mais avançada tecnologia Baileys para máxima compatibilidade e estabilidade. Com **arquitetura modular**, **sistema de cache avançado** e **processamento de eventos independente** para máxima performance e escalabilidade. A versão 1.0.4 introduz um sistema centralizado de logging baseado em Winston com rotação de arquivos, substituindo completamente o uso de console.log em toda a aplicação.

## ✨ Características

- 🚀 **Alta Performance**: Otimizado para processamento eficiente de mensagens
- 🔒 **Seguro**: Implementação segura com autenticação robusta
- 📱 **Compatível**: Totalmente compatível com WhatsApp Web
- 🔄 **Reconexão Automática**: Sistema inteligente de reconexão
- 📊 **Logs Centralizados**: Sistema completo de logging com Winston para monitoramento e diagnóstico
- 🤖 **Sistema de Comandos**: Processamento inteligente de comandos com prefixos configuráveis
- ⚡ **Switch Case**: Arquitetura otimizada para processamento de comandos
- 🎯 **Respostas Inteligentes**: Sistema de respostas automáticas e contextuais
- 🏗️ **Arquitetura Modular**: Sistema dividido em módulos independentes
- 💾 **Cache Avançado**: Sistema de cache inteligente com TTL configurável
- 🎯 **Processamento de Eventos**: Handler independente para todos os eventos WhatsApp
- 📈 **Estatísticas Detalhadas**: Monitoramento completo do sistema e cache
- 🔄 **Processamento Assíncrono**: Execução assíncrona para melhor desempenho
- 📝 **Rotação de Logs**: Sistema automatizado de rotação e compressão de logs

### ⚙️ Configuração de Comandos

O prefixo dos comandos é configurável através da variável `COMMAND_PREFIX` no arquivo `.env`:

```bash
# Prefixo padrão: /
COMMAND_PREFIX=/

# Exemplos de outros prefixos:
# COMMAND_PREFIX=!
# COMMAND_PREFIX=.
# COMMAND_PREFIX=#
```

### 🔧 Arquitetura de Comandos

- **Switch Case**: Processamento otimizado com estrutura switch/case
- **Extração Inteligente**: Suporte a diferentes tipos de mensagem (texto, legendas de mídia)
- **Validação**: Sistema robusto de validação de comandos
- **Tratamento de Erros**: Respostas amigáveis para erros e comandos inválidos
- **Respostas Modulares**: Sistema modular para diferentes tipos de resposta

## 🏗️ Arquitetura Modular

O OmniZap v1.0.4 aprimora a **arquitetura modular avançada** que separa responsabilidades e melhora a manutenibilidade:

### 📦 Módulos Principais

#### 🔗 Socket Controller (`app/connection/socketController.js`)
- **Responsabilidade**: Gerenciamento da conexão WhatsApp
- **Funcionalidades**: 
  - Conexão e reconexão automática
  - Processamento de QR Code
  - Distribuição de eventos para outros módulos
  - Tratamento de diferentes tipos de conexão
  - Suporte a múltiplas sessões
  - Integração com sistema centralizado de logging

#### 🔄 Cache Manager (`app/cache/cacheManager.js`)
- **Responsabilidade**: Sistema de cache inteligente
- **Funcionalidades**:
  - Cache de mensagens (TTL: 1 hora)
  - Cache de eventos (TTL: 30 minutos)
  - Cache de grupos (TTL: 2 horas)
  - Cache de contatos (TTL: 4 horas)
  - Cache de chats (TTL: 1 hora)
  - Limpeza automática e otimização
  - Estatísticas detalhadas de performance

#### 🎯 Event Handler (`app/events/eventHandler.js`)
- **Responsabilidade**: Processamento independente de eventos
- **Funcionalidades**:
  - Processamento assíncrono de todos os eventos WhatsApp
  - Integração com o Cache Manager
  - Logging detalhado de atividades através do sistema centralizado
  - Tratamento especializado para cada tipo de evento
  - Pré-carregamento inteligente de dados de grupo

#### 💬 Message Controller (`app/controllers/messageController.js`)
- **Responsabilidade**: Lógica de negócios e processamento de comandos
- **Funcionalidades**:
  - Processamento de mensagens recebidas
  - Sistema de comandos com switch/case
  - Extração inteligente de conteúdo de diferentes tipos de mensagens
  - Respostas inteligentes e contextuais
  - Tratamento de erros e validações
  - Suporte a mensagens de grupo

#### 📝 Logger Module (`app/utils/logger/loggerModule.js`)
- **Responsabilidade**: Sistema centralizado de logging
- **Funcionalidades**:
  - Logs em múltiplos níveis (error, warn, info, debug)
  - Rotação automática de arquivos de log
  - Compressão automática de logs antigos
  - Logs separados por tipo (aplicação, erro, aviso)
  - Formatação avançada para console e arquivos
  - Captura de exceções não tratadas

### � Atualizações da v1.0.4

- **🔧 Melhorias técnicas:**
  - Implementação de sistema centralizado de logging baseado em Winston
  - Padronização de todos os arquivos com cabeçalhos de documentação
  - Substituição completa de console.log/error por logger estruturado
  - Melhor tratamento e captura de erros em todos os módulos
  - Rotação e compressão automática de arquivos de log

- **✨ Novos recursos:**
  - Sistema de logging em múltiplos níveis (error, warn, info, debug)
  - Logs separados por tipo (aplicação, erro, aviso)
  - Cabeçalhos padronizados em todos os módulos com versão e autoria
  - Mensagens de erro mais detalhadas com stack traces
  
- **🐛 Correções:**
  - Melhorias na captura e log de exceções não tratadas
  - Padronização do formato de logs em todos os módulos
  - Melhor rastreabilidade de erros através do sistema centralizado

## 📝 Sistema de Logging Centralizado

O OmniZap v1.0.4 introduz um sistema avançado de logging centralizado com Winston:

### 📊 Níveis de Log

| Nível | Descrição | Uso Típico |
|------|-----|-----------|
| **error** | Erros críticos | Falhas de conexão, exceções não tratadas |
| **warn** | Avisos importantes | Reconexões, timeouts, problemas não críticos |
| **info** | Informações operacionais | Conexões, desconexões, eventos importantes |
| **debug** | Informações detalhadas | Detalhes de processamento, útil para desenvolvimento |

### 🔧 Funcionalidades do Logger

- **Rotação de Arquivos**: Logs são divididos por data (formato YYYY-MM-DD)
- **Compressão Automática**: Arquivos antigos são comprimidos em .gz
- **Logs Separados**: Arquivos independentes para erros, avisos e logs gerais
- **Formatação Rica**: Logs coloridos no console, formato JSON em arquivos
- **Captura de Exceções**: Registra automaticamente exceções não tratadas
- **Metadados**: Inclui informações de serviço, instância e ambiente
- **Configurável**: Ajuste de nível de log por ambiente (development/production)

## 🔄 Fluxo de Eventos

```
                                    ┌─────────────────┐
                                    │   Logger Module  │
                                    │     (Logging)    │
                                    └─────────────────┘
                                            ▲
                                            │
                                            │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Socket Controller  │ -> │   Event Handler   │ -> │  Cache Manager  │
│  (Conexão)         │    │  (Processamento)  │    │  (Armazenamento)│
└─────────────────┘     └──────────────────┘    └─────────────────┘
         │                        │                      │
         │                        │                      │
         v                        v                      v
┌─────────────────┐     ┌──────────────────┐
│ Message Controller │ <-│     OmniZap Main    │
│ (Lógica Negócio) │    │   (Coordenação)    │
└─────────────────┘     └──────────────────┘
```

### ⚡ Vantagens da Arquitetura Modular

- **Escalabilidade**: Cada módulo pode ser otimizado independentemente
- **Manutenibilidade**: Código organizado e fácil de manter
- **Performance**: Processamento assíncrono e cache inteligente
- **Flexibilidade**: Fácil adição de novos recursos
- **Monitoramento**: Logs detalhados para cada módulo
- **Resiliente**: Tratamento avançado de erros e reconexão automática
- **Eficiente**: Uso de setImmediate para processamento em segundo plano

## 🛠️ Tecnologias

- **Node.js** >= 16.0.0
- **@whiskeysockets/baileys** ^6.7.0 - API WhatsApp Web de alta performance
- **Chalk** ^4.1.2 - Formatação colorida de console
- **Moment.js** ^0.5.48 - Manipulação de datas e timezones
- **Node Cache** ^5.1.2 - Sistema de cache avançado
- **Pino** ^7.11.0 - Logger de alta performance
- **Dotenv** ^16.5.0 - Gerenciamento de variáveis de ambiente
- **Envalid** ^8.0.0 - Validação de variáveis de ambiente
- **@hapi/boom** ^10.0.1 - Tratamento de erros HTTP
- **QRCode Terminal** ^0.12.0 - Geração de QR Code no terminal
- **Winston** ^3.3.3 - Logger versátil com suporte a múltiplos transportes

## 💾 Sistema de Cache Avançado

O OmniZap utiliza um sistema de cache inteligente com múltiplas camadas:

### 📊 Tipos de Cache

| Tipo | TTL | Descrição |
|------|-----|-----------|
| **Mensagens** | 1 hora | Cache de mensagens recebidas e enviadas |
| **Eventos** | 30 min | Cache de eventos do WhatsApp |
| **Grupos** | 2 horas | Metadados de grupos |
| **Contatos** | 4 horas | Informações de contatos |
| **Chats** | 1 hora | Dados de conversas |

### 🔧 Funcionalidades do Cache

- **Hit/Miss Tracking**: Estatísticas detalhadas de performance
- **TTL Configurável**: Tempo de vida personalizado por tipo
- **Limpeza Automática**: Remoção inteligente de dados expirados
- **Backup Automático**: Backup periódico das estatísticas
- **Otimização de Memória**: Gerenciamento eficiente de recursos

## 📦 Instalação

1. Clone o repositório:
```bash
git clone https://github.com/Kaikygr/omnizap-system.git
cd omnizap-system
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```

4. Execute o sistema:
```bash
npm start
```

## 🚀 Uso

1. Execute o sistema:
```bash
npm start
```

2. Escaneie o QR Code que aparecerá no terminal com seu WhatsApp
3. Aguarde a mensagem de conexão bem-sucedida
4. O sistema está pronto para processar mensagens e comandos!

## 📁 Estrutura do Projeto

```
omnizap-system/
├── app/
│   ├── cache/
│   │   └── cacheManager.js        # Sistema de cache avançado
│   ├── connection/
│   │   └── socketController.js    # Controle de conexão WhatsApp
│   ├── controllers/
│   │   └── messageController.js   # Processamento de mensagens e comandos
│   └── events/
│       └── eventHandler.js        # Processamento independente de eventos
├── qr-code/                       # Dados de autenticação (auto-gerado)
├── .env                          # Configurações do ambiente
├── .env.example                  # Template de configurações
├── .gitignore                    # Arquivos ignorados pelo Git
├── index.js                      # Arquivo principal
├── package.json                  # Dependências e scripts
├── LICENSE                       # Licença MIT
└── README.md                     # Documentação
```

### 📦 Descrição dos Módulos

#### Core System
- **`index.js`**: Arquivo principal que inicializa o sistema

#### Módulos da Aplicação
- **`app/cache/cacheManager.js`**: Gerenciador de cache com TTL e estatísticas
- **`app/connection/socketController.js`**: Controlador de conexão WhatsApp
- **`app/controllers/messageController.js`**: Processador de mensagens e comandos
- **`app/events/eventHandler.js`**: Processador independente de eventos

#### Configuração e Dados
- **`qr-code/`**: Diretório para dados de autenticação (criado automaticamente)
- **`.env`**: Variáveis de ambiente do sistema

## ⚙️ Configuração

### Variáveis de Ambiente

#### Configurações Principais
- `QR_CODE_PATH`: Caminho para armazenar dados de autenticação (padrão: `./app/connection/qr-code`)
- `COMMAND_PREFIX`: Prefixo dos comandos do bot (padrão: `/`)

#### Exemplo de Configuração (.env)
```bash
# Configurações do OmniZap
QR_CODE_PATH=./app/connection/qr-code
COMMAND_PREFIX=/

# Configurações opcionais de cache (implementação futura)
# CACHE_TTL_MESSAGES=3600
# CACHE_TTL_EVENTS=1800
# CACHE_TTL_GROUPS=7200
# CACHE_TTL_CONTACTS=14400
# CACHE_TTL_CHATS=3600
```

Veja o arquivo `.env.example` para mais detalhes sobre todas as configurações disponíveis.

## 🚀 Performance e Otimizações

### ⚡ Melhorias de Performance

- **Processamento Assíncrono**: Todos os eventos são processados de forma não-bloqueante
- **Cache Inteligente**: Sistema de cache com diferentes TTLs para otimizar acesso a dados
- **Modularização**: Separação de responsabilidades reduz overhead
- **Logging Otimizado**: Sistema de logs colorido e estruturado

### 📊 Métricas de Sistema

O sistema monitora automaticamente:
- Taxa de hits/misses do cache
- Uso de memória por módulo
- Tempo de resposta dos comandos
- Quantidade de eventos processados
- Status de conexão em tempo real

### 🔧 Otimizações Implementadas

- **Lazy Loading**: Módulos carregados sob demanda
- **Memory Management**: Limpeza automática de cache
- **Event Batching**: Processamento em lote de eventos similares
- **Connection Pooling**: Reutilização eficiente de conexões

## 🔧 Desenvolvimento

### Scripts Disponíveis

- `npm start`: Inicia o sistema em modo produção

### 🛠️ Desenvolvimento Local

#### Configuração do Ambiente
```bash
# Clone o repositório
git clone https://github.com/Kaikygr/omnizap-system.git
cd omnizap-system

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env

# Execute o sistema
npm start
```


### 📁 Estrutura de Desenvolvimento

#### Adicionando Novos Comandos
1. Edite `app/controllers/messageController.js`
2. Adicione o novo case no switch statement
3. Implemente a função correspondente
4. Teste com o comando no WhatsApp

#### Adicionando Novos Eventos
1. Edite `app/events/eventHandler.js`
2. Adicione o novo processador de evento
3. Integre com o Cache Manager se necessário
4. Adicione logs apropriados

### Contribuindo

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

#### 📋 Guidelines de Contribuição

- **Código**: Siga o padrão de nomenclatura existente
- **Commits**: Use mensagens descritivas em português
- **Testes**: Teste todas as funcionalidades antes do PR
- **Documentação**: Atualize a documentação quando necessário
- **Modularidade**: Mantenha a arquitetura modular

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 🤝 Suporte

Para suporte e dúvidas:

- 📧 Email: kaikygomesribeiroof@gmail.com
- 🐛 Issues: [GitHub Issues](https://github.com/Kaikygr/omnizap-system/issues)
- 📖 Documentação: [Wiki](https://github.com/Kaikygr/omnizap-system/wiki)


**OmniZap v1.0.4** - Sistema Profissional de Automação WhatsApp com Arquitetura Modular © 2025
