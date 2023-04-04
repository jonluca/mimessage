import { queryClient } from "../pages/_app";

export const register = () => {
  global.ipcRenderer.on("refreshChats", async () => {
    await queryClient.invalidateQueries();
    await queryClient.refetchQueries();
  });
};
