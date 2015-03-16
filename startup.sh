TODAY=$(date +"%Y%m%d")
nohup forever ./bin/www > /dev/null 2>&1 >> ./logs/console.log_$TODAY &
