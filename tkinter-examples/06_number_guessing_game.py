import tkinter as tk
import random as r

ln = r.randint(1,100)
count=0

def click():
    global count, ln
    count+=1
    label1.config(text=f'시도 횟수 {count}')
    num = int(ans1_entry.get())
    if num==ln:
        labels.config(text='정답입니다!')
        ans1_entry.config(state='disabled')
    elif num>ln:
        labels.config(text='큽니다. 작은 숫자 입력하세요.')
    else:
        labels.config(text='작습니다. 큰 숫자를 입력하세요.')
def reset():
    global count
    count=0
    label1.config(text=f'시도 횟수 {count}')
    labels.config(text='숫자를 입력하고 확인을 눌러주세요.')
    ln=r.randint(1,100)
    ans1_entry.config(state='normal')
    ans1_entry.delete(0,tk.END)
    
screen=tk.Tk()
screen.title("업다운 숫자 게임")
screen.geometry("520x420")

label = tk.Label(screen, text="1부터 100 사이의 숫자를 맞혀 보세요!", font=("Arial", 10))
label.pack(pady=20)

tk.Label(screen, text="").pack()
ans1_entry=tk.Entry(screen)
ans1_entry.pack()

tk.Button(screen, text="확인",command=click).pack(pady=10)

labels = tk.Label(screen, text="숫자를 입력하고 확인을 눌러주세요.", font=("Arial", 10))
labels.pack(pady=10)

label1 = tk.Label(screen, text=f"시도 횟수 {count}", font=("Arial", 10))
label1.pack(pady=10)

tk.Button(screen, text="다시 시작",command=reset).pack(pady=10)

screen.mainloop()
