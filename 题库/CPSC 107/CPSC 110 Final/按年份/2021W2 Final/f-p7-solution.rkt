;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p7-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w2-f/f-p7)

(@problem 1) ;do not edit or delete this line 
(@problem 2) ;do not edit or delete this line 
(@problem 3) ;do not edit or delete this line 
(@problem 4) ;do not edit or delete this line 
(@problem 5) ;do not edit or delete this line 
(@problem 6) ;do not edit or delete this line 
(@problem 7) ;do not edit or delete this line 

#|

Consider these data definitions:

|#

(@htdd Star)

(define-struct star (nm mag lon))
;; Star is (make-star String Number (listof String))
;; interp. a star having a name, magnitude (brightness), and list of names of
;; stars to which it is connected in its constellation.
;;
;; Stars form a generative graph using the lookup-star function (see below).
;;

;;
;; A diagram of this constellation is in f-p7-image.png in the downloads.
;;
(define AURIGA
  (list (make-star "Capella" 0.2
                   (list "Delta Aur" "Menkalinan" "Haedus" "Almaaz"))
        (make-star "Delta Aur" 3.9
                   (list "Capella" "Menkalinan"))
        (make-star "Menkalinan" 1.9
                   (list "Delta Aur" "Mahasim" "Capella"))
        (make-star "Mahasim" 2.6
                   (list "Menkalinan" "Hassaleh"))
        (make-star "Hassaleh" 2.8
                   (list "Mahasim" "Haedus"))
        (make-star "Haedus" 3.1
                   (list "Hassaleh" "Capella" "Saclateni"))
        (make-star "Saclateni" 3.9
                   (list "Haedus" "Almaaz"))
        (make-star "Almaaz" 3.1
                   (list "Saclateni" "Capella"))
        (make-star "Sigma Aur" 5.2
                   empty))) 


(@template-origin encapsulated genrec Star (listof String))

(define (fn-for-constellation s)
  (local [(define (fn-for-star s)
            (... (star-nm s)
                 (star-mag s)
                 (fn-for-lon (star-lon s))))

          (define (fn-for-lon lon)    ;lon is list of star names (listof String)
            (cond [(empty? lon) (...)]  
                  [else
                   (... (fn-for-star (lookup-star (first lon)))
                        (fn-for-lon (rest lon)))]))]
    
    (fn-for-star s)))

;;
;; Consider this to be a primitive function that comes with the data definitions
;; and that given a star name it produces the corresponding star.  Because
;; this consumes a string and generates a star calling it will amount to a
;; generative step in a recursion through a constellation of stars (a graph).
;;
(@htdf lookup-star)
(@signature String -> Star)

(define (lookup-star name)
  (local [(define (scan lst)
            (cond [(empty? lst) (error "No star named " name)]
                  [else
                   (if (string=? (star-nm (first lst)) name)
                       (first lst)
                       (scan (rest lst)))]))]
    (scan AURIGA)))


(@htdf increasing-magnitude-path)
(@signature Star String -> (listof String) or false)
;; produce path from s0 to sn with strictly increasing magnitude; or fail
(check-expect (increasing-magnitude-path (lookup-star "Capella") "Sigma Aur")
              false)
(check-expect (increasing-magnitude-path (lookup-star "Mahasim") "Mahasim")
              (list "Mahasim"))
(check-expect (increasing-magnitude-path (lookup-star "Capella") "Hassaleh")
              (list "Capella" "Menkalinan" "Mahasim" "Hassaleh"))


#;#;
(@template-origin genrec Star (listof String) accumulator try-catch)
(define (increasing-magnitude-path s0 to-sn)
  ;; path is (listof String); star names to here on current path in graph
  ;; prev-mag is Number; magnitude of previous star on path
  (local [(define (fn-for-star s path prev-mag)
            (local [(define npath (cons (star-nm s) path))
                    (define nmag  (star-mag s))]
              (cond [(<= (star-mag s) prev-mag) false]
                    [(string=? (star-nm s) to-sn) (reverse npath)]
                    [else
                     (fn-for-lon (star-lon s) npath nmag)])))

          (define (fn-for-lon lon path prev-mag)
            (cond [(empty? lon) false]
                  [else
                   (local [(define try
                             (fn-for-star (lookup-star (first lon))
                                          path
                                          prev-mag))]
                     (if (not (false? try))
                         try
                         (fn-for-lon (rest lon) path prev-mag)))]))]
    
    (fn-for-star s0 empty -inf.0)))


(@template-origin genrec Star (listof String) accumulator)
(define (increasing-magnitude-path s0 to-sn)
  ;; star-name-wl is (listof String)
  ;; worklist of star names
  ;; prev-mag-wl is (listof Number)           
  ;; tandem worklist of previous star magnitude   
  ;; path-wl is (listof (listof String))          
  ;; tandem worklist of star name path

  ;; an alternative approach would just have two worklists:
  ;; star-name-wl is (listof String)
  ;; worklist of star names
  ;; path-wl is (listof (listof Star))
  ;; tandem worklist of paths in constellation from s0 to current star
  
  (local [(define (fn-for-star s prev-mag path
                               star-name-wl prev-mag-wl path-wl)
            (local [(define nmag (star-mag s))
                    (define npath (cons (star-nm s) path))]
              (cond [(<= (star-mag s) prev-mag)
                     (fn-for-lon star-name-wl prev-mag-wl path-wl)]
                    [(string=? (star-nm s) to-sn) (reverse npath)]
                    [else
                     (fn-for-lon (append (star-lon s) star-name-wl)
                                 (append (make-list (length (star-lon s)) nmag)
                                         prev-mag-wl)
                                 (append (make-list (length (star-lon s)) npath)
                                         path-wl))])))
          (define (fn-for-lon star-name-wl prev-mag-wl path-wl)
            (cond [(empty? star-name-wl) false]
                  [else
                   (fn-for-star (lookup-star (first star-name-wl))
                                (first prev-mag-wl)
                                (first path-wl)
                                (rest star-name-wl)
                                (rest prev-mag-wl)
                                (rest path-wl))]))]
    (fn-for-star s0 -inf.0 empty empty empty empty)))

