;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p5-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #t #t none #f () #f)))
(require spd/tags)
(require 2htdp/image)

(@assignment exams/2023s-f/f-p5)




(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line


(@htdf stack-boxes)
(@signature (listof (listof String)) -> Image)
;; produce stacks of color boxes, beside each other, bottom-aligned
(check-expect (stack-boxes empty) empty-image)
(check-expect (stack-boxes (list (list "red")))
              (b/a-b (above (box "red")
                          empty-image)
                   empty-image))
(check-expect (stack-boxes (list (list "red")
                                 (list "blue" "green" "yellow")
                                 (list "orange" "grey")))
              (b/a-b (above (box "red")
                          empty-image)
                   (b/a-b (above (box "blue")
                               (box "green")
                               (box "yellow")
                               empty-image)
                        (b/a-b (above (box "orange")
                               (box "grey")
                               empty-image)
                             empty-image))))

(@template-origin fn-composition use-abstract-fn)


(foldr func empty-image (list A B C))

(b/a-b X (b/a-b Y (b/a-b Z empty-image)))

(foldr above empty-image (list b1 b2 b3))

(above b1 (above b2 (above b3 empty-image)))

(map add1 (list 1 2 3)) => (list 2 3 4)

(map number->string (list 1 2 3)) => (list "1" "2" "3")



(define (stack-boxes lolos)
  #;
  (foldr b/a-b
         empty-image
         (map (lambda (los)
                (foldr above empty-image (map box los)))
              lolos))

  (foldr (lambda (loi base)
           (b/a-b (foldr above empty-image loi)
                  base))
         empty-image
         (map (lambda (los) (map box los))
              lolos))
  #;
  (foldr (lambda (los img)
           (b/a-b (foldr (lambda (s img)
                         (above (box s) img))
                       empty-image
                       los)
                img))
         empty-image
         lolos))

(@htdf box)
(@signature String -> Image)
;; produce 20x20 box of given color
(check-expect (box "red") (square 20 "solid" "red"))
(check-expect (box "blue") (square 20 "solid" "blue"))

(@template-origin String)

(define (box s) (square 20 "solid" s))

(@htdf b/a-b)
(@signature Image Image -> Image)
;; place images beside each other aligned on their bottom edge
(check-expect (b/a-b (box "red") (box "blue"))
              (beside/align "bottom" (box "red") (box "blue")))
(check-expect (b/a-b (box "pink") (box "green"))
              (beside/align "bottom" (box "pink") (box "green")))

(@template-origin String)

(define (b/a-b a b) (beside/align "bottom" a b))



(foldr (lambda (loi base)
           (b/a-b (foldr above empty-image loi)
                  base))
         empty-image
         (map (lambda (los) (map box los))
              lolos))



(list (list "r" "g") (list "y" "p"))

(list (list Br Bg) (list By Bp))

(list (above Br Bg) (above By Bp))

(foldr func empty (list (list Br Bg) (list By Bp)))

(b/a-b (above Br Bg empty-image)
       (b/a-b (above By Bp empty-image)
              empty-image))