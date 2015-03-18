TODAY=$(date +"%Y%m%d")
. ~/.bash_profile
cd /home/ec2-user/projects/epaper
node batch_paper_coin.js > /dev/null >> ./logs/paper_coin.log_$TODAY 2>&1
