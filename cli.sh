#!/bin/bash

this_path=$(pwd)
config_file="$this_path/config.json"
workers_folder="$this_path/workers"

cf_redirector_auth="cf-redirector-auth"
redirector_auth="AUTH_WORKER"
cf_redirector_worker="cf-redirector-worker"
redirector_worker="REDIRECTOR_WORKER"

account_dev_subdomain=$(jq -r '.cf_account_dev_subdomain' "$config_file")
account_id=$(jq -r '.cf_account_id' "$config_file")
router_route_count=$(jq '.router_route | length' "$config_file")
listener_count=$(jq '.listeners | length' "$config_file")
secret_service_cf_id=$(jq -r '.secrets.service_cf_id' "$config_file")
secret_service_cf_secret=$(jq -r '.secrets.service_cf_secret' "$config_file")
secret_jwt_secret=$(jq -r '.secrets.jwt_secret' "$config_file")
secret_router_header=$(jq -r '.secrets.router_header' "$config_file")
secret_router_header_secret=$(jq -r '.secrets.router_header_secret' "$config_file")
secret_auth_header=$(jq -r '.secrets.auth_header' "$config_file")
secret_auth_header_secret=$(jq -r '.secrets.auth_header_secret' "$config_file")
secret_id_header=$(jq -r '.secrets.id_header' "$config_file")

# config changes that will require reseting one the four files
# listeners - "$workers_folder/cf-redirector-worker/src/index.js"
# router_route - the 3 wrangler.toml files

function printInfo() {
  echo ""
  echo "account_id: $account_id"
  echo "account_dev_subdomain: $account_dev_subdomain"
  echo "router_route_count: $router_route_count"
  echo "listener_count: $listener_count"
  echo "secret_service_cf_id: $secret_service_cf_id"
  echo "secret_service_cf_secret: $secret_service_cf_secret"
  echo "secret_jwt_secret: $secret_jwt_secret"
  echo "secret_router_header: $secret_router_header"
  echo "secret_router_header_secret: $secret_router_header_secret"
  echo "secret_auth_header: $secret_auth_header"
  echo "secret_auth_header_secret: $secret_auth_header_secret"
  echo "secret_id_header: $secret_id_header"
}

function installDependencies() {
  echo ""
  echo "Installing dependencies"
  cd "$workers_folder/cf-redirector-auth" || exit
  npm i
  npm update
  cd "$this_path" || exit
  cd "$workers_folder/cf-redirector-worker" || exit
  npm i
  npm update
  cd "$this_path" || exit
  cd "$workers_folder/cf-redirector-router" || exit
  npm i
  npm update
  cd "$this_path" || exit
}

function addBasicConfig() {
  echo ""
  echo "Adding basic config"
  echo "account_id = \"$account_id\"" >> "$workers_folder/cf-redirector-auth/wrangler.toml"
  echo "workers_dev = false" >> "$workers_folder/cf-redirector-auth/wrangler.toml"
  echo "account_id = \"$account_id\"" >> "$workers_folder/cf-redirector-worker/wrangler.toml"
  echo "workers_dev = false" >> "$workers_folder/cf-redirector-worker/wrangler.toml"
  echo "account_id = \"$account_id\"" >> "$workers_folder/cf-redirector-router/wrangler.toml"
}

function secretsAuthWorker() {
  # $workers_folder/cf-redirector-auth
  echo ""
  cd "$workers_folder/cf-redirector-auth" || exit
  echo "Creating secrets for cf-redirector-auth"
  echo "$secret_jwt_secret" | wrangler secret put JWT_SECRET
  echo "$secret_auth_header" | wrangler secret put AUTH_HEADER_KEY
  echo "$secret_auth_header_secret" | wrangler secret put AUTH_HEADER_SECRET
  cd "$this_path" || exit
}

function secretsRedirectorWorker() {
  # $workers_folder/cf-redirector-worker
  echo ""
  echo "Creating secrets for cf-redirector-worker"
  cd "$workers_folder/cf-redirector-worker" || exit
  echo "$secret_jwt_secret" | wrangler secret put JWT_SECRET
  echo "$secret_service_cf_id" | wrangler secret put SERVICE_CF_ID
  echo "$secret_service_cf_secret" | wrangler secret put SERVICE_CF_SECRET
  echo "$secret_id_header" | wrangler secret put ID_HEADER
  cd "$this_path" || exit
}

function secretsRouterWorker() {
  # $workers_folder/cf-redirector-router
  echo ""
  echo "Creating secrets for cf-redirector-router"
  cd "$workers_folder/cf-redirector-router" || exit
  COUNT=0
  while [[ $COUNT -lt $router_route_count ]]; do
    temp_router_route_name=$(jq -r ".router_route[$COUNT].name" "$config_file")
    echo "$secret_auth_header" | wrangler secret put AUTH_HEADER_KEY --env "$temp_router_route_name"
    echo "$secret_auth_header_secret" | wrangler secret put AUTH_HEADER_SECRET --env "$temp_router_route_name"
    echo "$secret_router_header" | wrangler secret put ROUTER_HEADER_KEY --env "$temp_router_route_name"
    echo "$secret_router_header_secret" | wrangler secret put ROUTER_HEADER_SECRET --env "$temp_router_route_name"
    COUNT=$((COUNT + 1))
  done
  cd "$this_path" || exit
}

function loopRoute() {
  echo ""
  echo "Looping Router routes"
  COUNT=0
  if [[ -f routerurls.txt ]]; then
    rm routerurls.txt
  fi
  touch routerurls.txt
  while [[ $COUNT -lt $router_route_count ]]; do
    router_use_dev_subdomain=$(jq -r ".router_route[$COUNT].use_dev_subdomain" "$config_file")
    router_route_use_custom_domain=$(jq -r ".router_route[$COUNT].use_custom_domain" "$config_file")
    temp_router_route_name=$(jq -r ".router_route[$COUNT].name" "$config_file")
    router_route_pattern=$(jq -r ".router_route[$COUNT].pattern" "$config_file")
    #
    this_router_route_env="[env.$temp_router_route_name]"
    this_router_name="name = \"$temp_router_route_name\""
    {
      echo ""
      echo "$this_router_route_env"
      echo "$this_router_name"
      echo "services = [{ binding = \"$redirector_auth\", service = \"$cf_redirector_auth\" },{ binding = \"$redirector_worker\", service = \"$cf_redirector_worker\" }]"
    } >> "$workers_folder/cf-redirector-router/wrangler.toml"
    # check if custom domain
    if [[ $router_route_use_custom_domain == "true" ]]; then
      worker_domain="$router_route_pattern"
      echo "routes = [{ pattern = \"$worker_domain\", custom_domain = $router_route_use_custom_domain }]" >> "$workers_folder/cf-redirector-router/wrangler.toml"
      echo "$worker_domain" >> routerurls.txt
    fi
    if [[ $router_use_dev_subdomain == "true" ]]; then
      worker_domain="$temp_router_route_name.$account_dev_subdomain"
      echo "workers_dev = true" >> "$workers_folder/cf-redirector-router/wrangler.toml"
      echo "$worker_domain" >> routerurls.txt
    fi
    if [[ $router_use_dev_subdomain == "false" ]]; then
      echo "workers_dev = false" >> "$workers_folder/cf-redirector-router/wrangler.toml"
    fi
    #
    COUNT=$((COUNT + 1))
  done
}

function deployWorkers() {
  echo ""
  echo "Deploying workers"
  cd "$workers_folder/cf-redirector-auth" || exit
  wrangler deploy
  cd "$this_path" || exit
  cd "$workers_folder/cf-redirector-worker" || exit
  wrangler deploy
  cd "$this_path" || exit
  cd "$workers_folder/cf-redirector-router" || exit
  #
  COUNT=0
  while [[ $COUNT -lt $router_route_count ]]; do
    temp_router_route_name=$(jq -r ".router_route[$COUNT].name" "$config_file")
    wrangler deploy --env "$temp_router_route_name"
    sleep 1
    COUNT=$((COUNT + 1))
  done
  #
  cd "$this_path" || exit
}

function loopListeners() {
  git checkout -- "$workers_folder/cf-redirector-worker/src/index.js"
  # create profiles.json
  echo "{" > "$this_path"/profiles.json
  echo ""
  echo "Looping through listeners"
  cd "$workers_folder/cf-redirector-worker" || exit
  LISTENER_COUNT=0
  {
    echo ""
    echo "function setDestUrl(PRESHARED_ID_HEADER) {"
    echo "  let this_destUrl = LISTEN_ENDPOINT;"
  } >> src/index.js
  while [[ $LISTENER_COUNT -lt $listener_count ]]; do
    temp_listener_id=$(jq -r ".listeners[$LISTENER_COUNT].id" "$config_file")
    temp_listener_name=$(jq -r ".listeners[$LISTENER_COUNT].name" "$config_file")
    temp_listener_name_uppercase=$(echo "$temp_listener_name" | tr '[:lower:]' '[:upper:]')
    temp_listener_port=$(jq -r ".listeners[$LISTENER_COUNT].port" "$config_file")
    temp_listener_bind_port=$(jq -r ".listeners[$LISTENER_COUNT].bind_port" "$config_file")
    temp_listener_address=$(jq -r ".listeners[$LISTENER_COUNT].address" "$config_file")
    temp_listener_default=$(jq -r ".listeners[$LISTENER_COUNT].is_default" "$config_file")
    temp_listener_var_name="LISTEN_ENDPOINT_$temp_listener_name_uppercase"
    #
    # adding to profiles.json
    #  echo "\"headers_$temp_listener_name\":[{\"name\":\"$secret_id_header\",\"value\":\"$temp_listener_id\"},{\"name\":\"$secret_router_header\",\"value\":\"$secret_router_header_secret\"}]," >> "$this_path"/profiles.json
    echo "$temp_listener_name"
    echo "\"$temp_listener_name\": {\"port\": \"$temp_listener_port\",\"bind_port\": \"$temp_listener_bind_port\",\"headers\":[{\"name\":\"$secret_id_header\",\"value\":\"$temp_listener_id\"},{\"name\":\"$secret_router_header\",\"value\":\"$secret_router_header_secret\"}]}," >> "$this_path"/profiles.json
    #
    echo ""
    #
    if [[ $temp_listener_default == "true" ]]; then
      echo "$temp_listener_address" | wrangler secret put LISTEN_ENDPOINT
    fi
    echo "$temp_listener_address" | wrangler secret put "$temp_listener_var_name"
    #
    {
      echo "  if (PRESHARED_ID_HEADER == \"$temp_listener_id\") {"
      echo "    this_destUrl = $temp_listener_var_name;"
      echo "  }"
    } >> src/index.js
    #
    LISTENER_COUNT=$((LISTENER_COUNT + 1))
  done
  {
    echo "  return this_destUrl;"
    echo "}"
  } >> src/index.js
  cd "$this_path" || exit
  #
  # finishing profiles.json
  cat "$this_path"/profiles.json | sed '$s/,$//' > "$this_path"/profiles_temp.json
  echo "}" >> "$this_path"/profiles_temp.json
  rm "$this_path"/profiles.json
  mv "$this_path"/profiles_temp.json "$this_path"/profiles.json
}

function deleteAllWorkers() {
  echo ""
  echo "Deleting workers"
  cd "$workers_folder/cf-redirector-router" || exit
  #
  COUNT=0
  while [[ $COUNT -lt $router_route_count ]]; do
    temp_router_route_name=$(jq -r ".router_route[$COUNT].name" "$config_file")
    wrangler delete --env "$temp_router_route_name" --force
    COUNT=$((COUNT + 1))
  done
  cd "$this_path" || exit
  cd "$workers_folder/cf-redirector-auth" || exit
  wrangler delete --force
  cd "$this_path" || exit
  cd "$workers_folder/cf-redirector-worker" || exit
  wrangler delete --force
  cd "$this_path" || exit
  #
  git checkout -- "$workers_folder/cf-redirector-router/wrangler.toml"
  git checkout -- "$workers_folder/cf-redirector-auth/wrangler.toml"
  git checkout -- "$workers_folder/cf-redirector-worker/wrangler.toml"
  git checkout -- "$workers_folder/cf-redirector-worker/src/index.js"
  #
  rm "$this_path/routerurls.txt"
  rm "$this_path/.first_deployment.txt"
  rm "$this_path/profiles.json"
}

function outputRouterHosts() {
  echo ""
  echo ""
  echo "[*] Your URLs(Hosts) for your C2 profiles:"
  echo ""
  cat routerurls.txt
  echo ""
  # if jq is installed
  if command -v jq &>/dev/null; then
    jq '.' "$this_path"/profiles.json
  else
    cat "$this_path"/profiles.json
  fi
}

function checkFirstDeployment() {
  if [[ ! -f "$this_path/.first_deployment.txt" ]]; then
    echo ""
    echo "[-] First deployment not done"
    echo "You should use -f for first deployment"
    echo "Use -h for help. Exiting..."
    exit 1
  fi
}

function doAllSecrets() {
  checkFirstDeployment
  # printInfo
  secretsAuthWorker
  secretsRedirectorWorker
  secretsRouterWorker
  loopListeners
  deployWorkers
  outputRouterHosts
}

function firstDeployment() {
  if [[ -f "$this_path/.first_deployment.txt" ]]; then
    echo ""
    echo "[-] First deployment already done"
    echo "You should use -d for deploying or -s for updating secrets"
    echo "Use -h for help. Exiting..."
    exit 1
  fi
  echo "tracking first deployment" > "$this_path/.first_deployment.txt"
  # printInfo
  installDependencies
  addBasicConfig
  loopRoute
  deployWorkers
  doAllSecrets
}

function parseArgs() {
  # Parse arguments
  while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
    -d | --deploy)
      checkFirstDeployment
      deployWorkers
      shift
      ;;
    -s | --secrets)
      doAllSecrets
      shift
      ;;
    -f | --first)
      firstDeployment
      shift
      ;;
    -r | --remove)
      checkFirstDeployment
      deleteAllWorkers
      shift
      ;;
    -l | --listeners)
      checkFirstDeployment
      loopListeners
      deployWorkers
      outputRouterHosts
      shift
      ;;
    -h | --help)
      echo "Usage: cli.sh [OPTION]"
      echo "Options:"
      echo "  -h, --help           Display this help message"
      echo "  -d, --deploy         Only deploy workers. If 1st deployment, use -f first"
      echo "  -f, --first          First deployment. After this, you should use -d for deploying"
      echo "  -l, --listeners      Update listeners (When changing config). To be use after first deployment."
      echo "  -r, --remove         Remove/Delete all workers. Delete all workers and reset files we changed"
      echo "  -s, --secrets        Create/update all secrets (useful when change config file). To be use after first deployment."
      exit 0
      ;;
    *)
      echo "Unknown option: $key"
      exit 1
      ;;
    esac
  done
}
parseArgs "$@"
