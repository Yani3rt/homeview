/* HomeView.app: keeps the HomeView server (python server.py) running, restarting it if it stops.
   It is a compiled app, so macOS asks once for Local Network access (camera, Sonos) and attributes the
   server and ffmpeg to "HomeView". HV_DIR and HV_PY are set at build time by install-mac-native.sh. */
#include <fcntl.h>
#include <spawn.h>
#include <stdio.h>
#include <sys/wait.h>
#include <unistd.h>
extern char **environ;
int main(void) {
    if (chdir(HV_DIR) != 0) return 1;
    for (;;) {
        int fd = open(HV_DIR "/data/server.log", O_WRONLY | O_CREAT | O_APPEND, 0644);
        posix_spawn_file_actions_t fa;
        posix_spawn_file_actions_init(&fa);
        if (fd >= 0) { posix_spawn_file_actions_adddup2(&fa, fd, 1); posix_spawn_file_actions_adddup2(&fa, fd, 2); }
        char *argv[] = { HV_PY, HV_DIR "/server.py", NULL };
        pid_t pid;
        if (posix_spawn(&pid, HV_PY, &fa, NULL, argv, environ) == 0) { int st; waitpid(pid, &st, 0); }
        posix_spawn_file_actions_destroy(&fa);
        if (fd >= 0) close(fd);
        sleep(3);
    }
}
