;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname psets-08-parts) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))



(check-expect (squares (list 5 2 4)) (list 25 4 16))

(define (squares lon)
  (map sqr lon))

(check-expect (sum (list 5 2 4)) 11)

(define (sum lon)
  (foldr + 0 lon))

(check-expect (counter (list 5 2 4)) 3)
(define (counter lon)
  (local [(define (count x rnr) (+ 1 rnr))]
    (foldr count 0 lon)))

(check-expect (sum-squares (list 6 7 8)) 149)

(define (sum-squares lon)
  (foldr + 0 (map sqr lon)))




(define (string-contains-w? w s)
  (string-contains? w s))

(define (all-contain-w? los)
  (andmap string-contains-w? los))


(define (all-a-contain? los w)
  (local [(define (start-with-a? s) (string=? (substring s 0 1) "a"))
          (define (string-contains-w? s) (string-contains? w s))]
    (andmap string-contains-w? (filter start-with-a? los))))

(define-struct cat (name color age))
(define C1 (make-cat "Whiskers" "brown" 13))
(define C2 (make-cat "Si"       "black"  4))
(define C3 (make-cat "Am"       "white"  4))
(define C4 (make-cat "Meow"     "brown"  7))
(define C5 (make-cat "Garfield" "orange" 8))
(define C6 (make-cat "Sassy"    "brown"  6))

(define LOC1 (list C1 C2 C3 C4 C5 C6)) ; to save time with check-expects
(define LOC2 (list C2 C3 C5))


(define (get-cat-names loc)
  (map cat-name loc))


(define (get-brown-cats loc)
  (local [(define (cat-brown? c) (string=? "brown" (cat-color c)))]
    (filter cat-brown? loc)))

(check-expect (count-short-names empty 0) 0)
(check-expect (count-short-names empty 10) 0)
(check-expect (count-short-names LOC1 5) 3)
(check-expect (count-short-names LOC1 6) 4)

(define (count-short-names loc n)
  (local [(define (get-cat-name-length c) (string-length (cat-name c)))
          (define (short-name? l) (< l n))
          (define (count x rnr) (+ 1 rnr))]
    (foldr count 0 (filter short-name? (map get-cat-name-length loc)))))



