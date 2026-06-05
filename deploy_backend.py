import paramiko
import os
import re

# SSH Configuration
hostname = '192.168.87.200'
username = 'subhra'
password = 'subho1234'
remote_dir = '/home/taskorbit'
local_zip = r'D:\github\TaskOrbit\backend.zip'
remote_zip = '/home/taskorbit/backend.zip'

def deploy():
    print(f"Connecting to remote server {hostname} as {username}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        ssh.connect(hostname, username=username, password=password, timeout=15)
        print("Connected successfully!")
        
        # 1. Create remote directory if not exists
        print(f"Ensuring remote directory {remote_dir} exists...")
        ssh.exec_command(f"mkdir -p {remote_dir}")
        
        # 2. Upload zip file using SFTP
        print("Uploading backend.zip...")
        sftp = ssh.open_sftp()
        sftp.put(local_zip, remote_zip)
        sftp.close()
        print("Uploaded successfully!")
        
        # 3. Unzip on remote server using python3 (safe and independent of unzip utility)
        print("Extracting files on remote server...")
        # First clean up any previously failed backslash-filename files
        ssh.exec_command(f"rm -f {remote_dir}/admin\\\\*")
        
        unzip_cmd = (
            "python3 -c \"\n"
            "import zipfile\n"
            "z = zipfile.ZipFile('" + remote_zip + "')\n"
            "for member in z.infolist():\n"
            "    member.filename = member.filename.replace(chr(92), '/')\n"
            "    z.extract(member, '" + remote_dir + "')\n"
            "z.close()\n"
            "\""
        )
        stdin, stdout, stderr = ssh.exec_command(unzip_cmd)
        exit_status = stdout.channel.recv_exit_status()
        if exit_status != 0:
            print("Extraction failed:")
            print(stderr.read().decode())
            return
        
        # Clean up zip file
        ssh.exec_command(f"rm {remote_zip}")
        print("Files extracted and archive cleaned up.")
        
        # 4. Find available port on remote server dynamically
        print("Checking for an available port on remote server...")
        port_cmd = "python3 -c \"import socket; s = socket.socket(); s.bind(('', 0)); print(s.getsockname()[1]); s.close()\""
        stdin, stdout, stderr = ssh.exec_command(port_cmd)
        free_port = stdout.read().decode().strip()
        if not free_port:
            print("Could not find a free port automatically, defaulting to 3001.")
            free_port = "3001"
        else:
            print(f"Found available port on remote host: {free_port}")
        
        # 5. Modify docker-compose.yml on remote server to use this port
        print("Updating port mapping in remote docker-compose.yml...")
        modify_compose_cmd = (
            f"python3 -c \""
            f"import re; "
            f"p = '{remote_dir}/docker-compose.yml'; "
            f"c = open(p).read(); "
            f"c2 = re.sub(r'- \\\"\\d+:3000\\\"', '- \\\"{free_port}:3000\\\"', c); "
            f"open(p, 'w').write(c2)\""
        )
        stdin, stdout, stderr = ssh.exec_command(modify_compose_cmd)
        exit_status = stdout.channel.recv_exit_status()
        if exit_status != 0:
            print("Updating docker-compose.yml failed:")
            print(stderr.read().decode())
            return
        print("docker-compose.yml port mapping updated.")
        
        # 6. Run docker compose build and run (try modern docker compose, fallback to docker-compose)
        print("Building and running docker-compose services on remote server...")
        docker_cmd = f"cd {remote_dir} && (docker compose down && docker compose up --build -d || docker-compose down && docker-compose up --build -d)"
        stdin, stdout, stderr = ssh.exec_command(docker_cmd)
        
        # Print standard output in real-time
        while True:
            line = stdout.readline()
            if not line:
                break
            print(line.strip())
            
        exit_status = stdout.channel.recv_exit_status()
        if exit_status != 0:
            print("Docker command failed. Error details:")
            print(stderr.read().decode())
            return
            
        print("\n==================================================")
        print("DEPLOYMENT COMPLETED SUCCESSFULLY!")
        print(f"TaskOrbit Backend is running on port: {free_port}")
        print(f"Please map taskorbit.subho.net to http://localhost:{free_port} in your reverse proxy config.")
        print("==================================================")
        
    except Exception as e:
        print("Deployment failed:", e)
    finally:
        ssh.close()

if __name__ == '__main__':
    deploy()
