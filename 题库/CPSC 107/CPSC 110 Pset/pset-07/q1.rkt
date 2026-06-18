;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-reader.ss" "lang")((modname q1) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@htdf decoder)
(@signature ListOf1String Operations -> String)
;; produce a String which is the result of the Operations on a ListOf1String

(check-expect (decoder empty empty) "")
(check-expect (decoder (list "a" "b" "c") empty) "abc")
(check-expect (decoder empty (list "keep" "remove" "space")) "")
(check-expect (decoder (list "i" "k" "l" "h" "a" "m" "k" "s" "a" "r" "m")
                       (list "keep" "remove" "remove" "space" "keep" "keep"
                             "space" "keep" "keep" "remove"))
              "i am sam")
(check-expect (decoder (list "f" "a" "d" "e")
                       (list "remove" "keep" "space" "keep"
                             "remove" "keep" "space"))
              "a e")


#|
  CROSS PRODUCT OF TYPE COMMENTS TABLE
  
  \                  |
   \ l               |   empty       (cons 1String ListOfString)
ops \                |
     \               |
---------------------------------------
 empty               |    ""        (string-append (first l) (decoder (rest l) empty))        (2)
 (cons "keep" ops)   |    ""        (string-append (first l) (decoder (rest l) (rest ops)))   (3)
 (cons "space" ops)  |    ""        (string-append " " (decoder (rest l) (rest ops)))         (4)
 (cons "remove" ops) |    ""        (decoder (rest l) (rest ops))                             (5)
                          (1)
|#

(@template-origin 2-one-of)
(define (decoder lst ops)
  (cond [(empty? lst) ""] ; 1
        [(empty? ops) (string-append (first lst) (decoder (rest lst) empty))] ; 2
        [(string=? (first ops) "keep") ; 3
         (string-append (first lst) (decoder (rest lst) (rest ops)))]
        [(string=? (first ops) "space") ; 4
         (string-append " " (decoder (rest lst) (rest ops)))]
        [else ; 5
        (string-append "" (decoder (rest lst) (rest ops)))]))

