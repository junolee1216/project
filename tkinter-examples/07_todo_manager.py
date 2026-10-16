import tkinter as tk
  
screen=tk.Tk()
screen.title("할 일 관리 프로그램")
screen.geometry("620x520")

def add():
    ans=todo_entry.get()
    if ans=="":
        return
    todo_entry.delete(0,tk.END)
    todo_list.insert(tk.END,ans)
    
def delete():
    selected = todo_list.curselection()
    if selected:
        todo_list.delete(selected[0])

def fix():
    selected = todo_list.curselection()
    if not selected:
        return
    new_todo = todo_entry.get()
    if new_todo == "":
        return
    todo_list.delete(selected[0])
    todo_list.insert(selected[0], new_todo)
    todo_entry.delete(0, tk.END)

label = tk.Label(screen, text="오늘 할 일을 적어 보세요.", font=("Arial", 10))
label.pack(pady=20)

todo_entry=tk.Entry(screen)
todo_entry.pack()
    
tk.Button(screen, text="추가", command=add).pack(pady=10)

todo_list=tk.Listbox(screen, width=60, height=18)
todo_list.pack()

tk.Button(screen, text="선택한 할 일 삭제", command=delete).pack(pady=10)

tk.Button(screen, text="수정하기", command=fix).pack(pady=10)

screen.mainloop()
