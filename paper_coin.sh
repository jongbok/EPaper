TODAY=$(date +"%Y%m%d")
cd /home/ec2-user/projects/epaper
node batch_paper_coin.js > /dev/null 2>&1 >> ./logs/paper_coin.log_$TODAY
