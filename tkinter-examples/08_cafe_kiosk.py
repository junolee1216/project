import tkinter as tk

sum = 0

def add():
    global sum
    selected = menu_list.curselection()
    if selected:
        menu = menu_list.get(selected[0])
        cart_list.insert(tk.END, menu)
        
    if selected[0] == 0 :
        sum += 3000
    elif selected[0] == 1:
        sum += 4000
    elif selected[0] == 2 :
        sum += 4500
    else:
        sum += 2000
    total_label.config(text=f"합계: {sum}원")
    
def sub():
    global sum
    selected = cart_list.curselection()
    if selected:
        menu = cart_list.get(selected[0])
        if menu == '아메리카노 3,000원':
            sum -= 3000
        elif menu == '카페라테 4,000원':
            sum -= 4000
        elif menu == '초코라테 4,500원':
            sum -= 4500
        elif menu == '쿠키 2,000원':
            sum -= 2000
        cart_list.delete(selected[0])
    total_label.config(text=f"합계: {sum}원")

screen=tk.Tk()
screen.title("카페 키오스크")
screen.geometry("600x600")

label = tk.Label(screen, text="메뉴를 골라 장바구니에 담아 보세요.", font=("Arial", 10))
label.pack(pady=20)

menu_list=tk.Listbox(screen, width=55, height=4)
for menu in ['아메리카노 3,000원', '카페라테 4,000원', '초코라테 4,500원', '쿠키 2,000원']:
    menu_list.insert(tk.END, menu)
menu_list.pack(pady=10)

tk.Button(screen, text="장바구니에 추가", command=add).pack(pady=10)

cart_list=tk.Listbox(screen, width=55, height=16)
cart_list.pack(pady=15)

tk.Button(screen, text="선택 항목 취소", command=sub).pack(pady=10)

total_label = tk.Label(screen, text="합계: 0원", font=("Arial", 10))
total_label.pack(pady=10)

screen.mainloop()
